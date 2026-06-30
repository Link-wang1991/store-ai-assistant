import { db } from "../db";
import { DEFAULT_BANNED_WORDS, type Role, type RiskLevel } from "../constants";
import { classifyQuestion, findBannedWords } from "./risk-classifier";
import { retrieveChunks, type RetrievedChunk } from "../knowledge/retrieve";
import { buildSystemPrompt, buildUserPrompt } from "./prompt-builder";
import { callLLM, getProvider } from "./adapter";
import { buildMockAnswer } from "./mock";
import { buildStoreContext } from "./store-context";
import { extractAndPersistMemory } from "./memory-extractor";
import { embedQuery, toVectorLiteral } from "./embedding";
import { roleLabel as resolveRoleLabel } from "../roles";
import { getDataScope } from "../permissions";
import { assignPool, POOL_PRIORITY } from "../customer-pools";
import type { AuthContext } from "../types";

type AnswerType = "knowledge" | "general" | "need_confirm" | "risk";

export interface AnswerResult {
  messageId: string;
  answer: string;
  category: string;
  riskLevel: RiskLevel;
  answerType: AnswerType;
  retrieved: RetrievedChunk[];
  needsReview: boolean;
  bannedHit: string[];
}

async function loadBannedWords(storeId: string): Promise<string[]> {
  const custom = await db.banned.listWords(storeId);
  return Array.from(new Set([...DEFAULT_BANNED_WORDS, ...custom]));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hideBannedWords(answer: string, bannedHit: string[]): string {
  return bannedHit.reduce((text, word) => {
    if (!word) return text;
    return text.replace(new RegExp(escapeRegExp(word), "g"), "【需规避表达】");
  }, answer);
}

// 构建"客户记忆与画像"上下文（第二阶段长记忆：档案 + 结构化记忆 + 近期互动）
async function buildCustomerProfile(storeId: string, customerId: string): Promise<string> {
  const cust: any = await db.customers.getById(customerId, storeId);
  if (!cust) return "";
  const STAGE: Record<string, string> = {
    new: "新客咨询", intent: "意向", deal: "已成交", regular: "老客", churn_risk: "流失风险",
  };
  const stageLabel = STAGE[cust.stage] || cust.stage;
  const lines: string[] = [];
  lines.push(`姓名：${cust.name}｜档案当前阶段（唯一准绳）：${stageLabel}｜来源：${cust.source || "未知"}`);
  lines.push(`阶段判断硬规则：回答里的「客户判断」必须先写「档案当前阶段：${stageLabel}」。近期互动/旧AI建议/会谈里如果出现已到店、已做项目、术后、成交等进展，只能写成「建议人工确认后把阶段更新为 X」，不得把它直接当作当前阶段，更不得写「严格来说已成交」「当前是已成交术后恢复期」。`);
  const profile = [
    cust.personality && `性格底色：${cust.personality}`,
    cust.spending_power && `消费能力：${cust.spending_power}`,
    cust.decision_style && `决策风格：${cust.decision_style}`,
    cust.communication_pref && `沟通偏好：${cust.communication_pref}`,
    cust.concerns && `当前顾虑/阻碍：${cust.concerns}`,
    cust.repurchase_opp && `复购/升单机会：${cust.repurchase_opp}`,
  ].filter(Boolean);
  if (profile.length) lines.push(profile.join("；"));
  if (Array.isArray(cust.tags) && cust.tags.length) lines.push(`标签：${cust.tags.join("、")}`);
  if (cust.notes) lines.push(`备注：${cust.notes}`);

  const mems = (await db.memory.listForCustomer(storeId, customerId)) as any[];
  if (mems.length) lines.push("已知要点：" + mems.map((m) => `${m.key}=${m.value}`).join("；"));

  const inters = (await db.interactions.listByCustomer(customerId, storeId, 5)) as any[];
  if (inters.length) {
    lines.push("近期互动（仅作事实参考；若与档案当前阶段冲突，以档案阶段为准，只提示建议更新）：");
    for (const it of inters) lines.push(`· ${(it.title || it.kind || "互动")}：${(it.summary || "").slice(0, 60)}`);
  }
  return lines.join("\n");
}

// 检测「客户汇总类」提问（不针对某一个客户，而是想盘点谁该跟进/沉睡/今天跟谁）
function isCustomerDigestQuery(q: string): boolean {
  const aboutCustomer = /(客户|顾客|老客|新客|会员)/.test(q);
  const wantList =
    /(哪些|谁|名单|盘点|盘一盘|列一下|列出|今天.*跟|重点|该跟进|要跟进|需要跟进|沉睡|唤醒|久没来|久未到店|快流失|要回访|回访谁)/.test(q);
  return aboutCustomer && wantList;
}

// 构建「我负责/全店客户清单」：按机会池给 AI 一份真实可跟进的客户列表，
// 让「我有哪些客户该跟进」这类泛问也能基于真实数据回答，而不是编造。
async function buildMyCustomersDigest(ctx: AuthContext): Promise<string> {
  const scope = getDataScope(ctx, "customers");
  const raw =
    scope === "self"
      ? ((await db.customers.listByAssignee(ctx.store.id, ctx.employee.id)) as any[])
      : ((await db.customers.listByStore(ctx.store.id)) as any[]);
  if (!raw.length) return "";
  const POOL_CN: Record<string, string> = {
    risk: "风险待补救", today: "今日到店", new_deal: "新成交回访", dormant: "沉睡待唤醒", new: "新客", regular: "活跃老客",
  };
  const ACTION = ["risk", "today", "new_deal", "dormant", "new"];
  const actionable = raw
    .map((c) => ({ c, pool: assignPool(c) }))
    .filter((x) => ACTION.includes(x.pool))
    .sort((a, b) => (POOL_PRIORITY[b.pool] ?? 0) - (POOL_PRIORITY[a.pool] ?? 0));
  const lines: string[] = [];
  lines.push(
    `【${scope === "self" ? "我负责" : "全店"}的客户共 ${raw.length} 位；需要行动的 ${actionable.length} 位（已按优先级排序）】`
  );
  for (const { c, pool } of actionable.slice(0, 25)) {
    const since = c.last_visit_at ? Math.floor((Date.now() - new Date(c.last_visit_at).getTime()) / 86400000) : null;
    const bits = [c.name || "客户", POOL_CN[pool] || pool];
    bits.push(since != null ? `${since}天未到店` : "无到店记录");
    if (c.concerns) bits.push(`顾虑:${String(c.concerns).slice(0, 24)}`);
    if (c.next_follow_at) bits.push(`约跟进:${String(c.next_follow_at).slice(0, 10)}`);
    lines.push("· " + bits.join("｜"));
  }
  if (actionable.length > 25) lines.push(`…还有 ${actionable.length - 25} 位，先处理上面优先的`);
  lines.push("（以上是真实负责的客户，请只基于这份清单回答谁最该跟、为什么、怎么跟，不要编造清单外的客户）");
  return lines.join("\n");
}

// 完整问答流程（产品说明书第十六章）
export async function answerQuestion(
  ctx: AuthContext,
  sessionId: string,
  question: string,
  opts: { customerId?: string } = {}
): Promise<AnswerResult> {
  const role = ctx.employee.role as Role;
  const baseRole = ctx.baseRole as Role; // 自定义角色按 base 模板决定行为与知识可见性
  const storeId = ctx.store.id;
  const customerId = opts.customerId;
  const internalQuery =
    /排班|上班|几点|班次|休息|早班|晚班|值班|轮班|通知|培训|制度|考勤|重要事项|开会|晨会/.test(question);

  // 1. 分类 + 初判风险
  const { category, baseRisk } = classifyQuestion(question);

  // 2. 检索门店知识 + 业务数据（排班/通知/活动/项目）+ 系统增长方法论 + 客户画像
  // 先把问题向量化一次，知识库与方法论共用（向量优先，失败/无命中回退 bigram）
  const queryEmbedding = await embedQuery(question);
  const retrieved = await retrieveChunks({ storeId, role: baseRole, query: question, queryEmbedding });
  const storeCtx = await buildStoreContext(ctx, question);
  let pbs: any[] = [];
  if (queryEmbedding) {
    try {
      pbs = (await db.playbooks.matchByEmbedding(
        storeId,
        baseRole,
        toVectorLiteral(queryEmbedding),
        5
      )) as any[];
    } catch {
      pbs = [];
    }
  }
  if (!pbs.length) pbs = (await db.playbooks.search(storeId, question, baseRole, 5)) as any[];
  const playbookTexts = (pbs as any[]).map(
    (p) =>
      `${p.title}（${p.module}）｜客户心理：${p.customer_psychology || "-"}｜常见误区：${p.common_mistakes || "-"}｜策略原理：${p.strategy || "-"}｜话术范例(仅示范结构与分寸，请按客户改写)：${p.scripts || "-"}｜追问：${p.follow_up_questions || "-"}｜下一步：${p.next_action || "-"}｜风险：${p.risk_note || "-"}｜理论依据：${p.source || "-"}`
  );
  const customerProfile = customerId ? await buildCustomerProfile(storeId, customerId) : "";
  // 泛问「我有哪些客户该跟进/谁沉睡了」类 → 注入该员工真实负责的客户清单，让 AI 基于真实数据回答
  const myCustomers =
    !customerId && isCustomerDigestQuery(question) ? await buildMyCustomersDigest(ctx) : "";
  // 门店级长记忆：本店已验证的经营经验（有效话术/难成交类型/活动反馈），反哺所有回答
  const storeMems = (await db.memory.listForStore(storeId, 8)) as any[];
  const storeMemory = storeMems.map((m) => `· ${m.value}`).join("\n");
  const contextPieces = retrieved.map((r) => r.content);
  if (myCustomers) contextPieces.unshift(myCustomers);
  if (storeCtx) contextPieces.unshift(storeCtx);
  const hasContext =
    contextPieces.length > 0 || playbookTexts.length > 0 || !!customerProfile || !!storeMemory;
  const label = resolveRoleLabel(role, ctx.roleLabels);

  // 3. 决定回答类型与最终风险等级
  let answerType: AnswerType;
  let riskLevel: RiskLevel;
  if (baseRisk === "L4") {
    answerType = "risk";
    riskLevel = "L4";
  } else if (baseRisk === "L3") {
    answerType = "need_confirm";
    riskLevel = "L3";
  } else if (hasContext) {
    answerType = "knowledge";
    riskLevel = "L1";
  } else {
    answerType = "general";
    riskLevel = "L2";
  }

  // 4. 生成回答
  const bannedWords = await loadBannedWords(storeId);
  let answer: string;

  if (answerType === "risk") {
    // 仅真正严重（已发生医疗异常 / 投诉退款纠纷）才用安全模板拦截升级，不调大模型
    answer = buildMockAnswer({ role: baseRole, roleLabel: label, question, contextChunks: [], answerType });
  } else if (getProvider() === "mock") {
    answer = buildMockAnswer({
      role: baseRole,
      roleLabel: label,
      question,
      contextChunks: [
        ...(customerProfile ? [`客户画像：\n${customerProfile}`] : []),
        ...(storeMemory ? [`本店已验证经验：\n${storeMemory}`] : []),
        ...contextPieces,
        ...playbookTexts,
      ],
      answerType,
    });
  } else {
    const system = buildSystemPrompt({
      storeName: ctx.store.name,
      brandName: ctx.store.brand_name,
      role: baseRole,
      roleLabel: label,
      bannedWords,
    });
    const user = buildUserPrompt(question, contextPieces, playbookTexts, customerProfile, storeMemory);
    // 结合本次对话上文：取该会话最近几轮，喂给模型做多轮上下文（话术部分，去掉分析块）
    const history: { role: "user" | "assistant"; content: string }[] = [];
    try {
      const past = (await db.chat.listSessionMessages(sessionId, 12)) as any[];
      for (const m of past.slice(-5)) {
        if (m.user_message) history.push({ role: "user", content: String(m.user_message).slice(0, 600) });
        if (m.ai_response)
          history.push({
            role: "assistant",
            content: String(m.ai_response).split("===ANALYSIS===")[0].trim().slice(0, 800),
          });
      }
    } catch {
      // 历史读取失败不影响回答
    }
    try {
      answer = await callLLM({ system, user, history });
    } catch {
      answer =
        "（AI 接口暂时不可用，已回退到通用建议）\n" +
        buildMockAnswer({
          role: baseRole,
          roleLabel: label,
          question,
          contextChunks: [
        ...(customerProfile ? [`客户画像：\n${customerProfile}`] : []),
        ...(storeMemory ? [`本店已验证经验：\n${storeMemory}`] : []),
        ...contextPieces,
        ...playbookTexts,
      ],
          answerType,
        });
    }
  }

  // 5. 禁用词检查
  // 禁用词仅对"对客话术/营销/医美承诺"场景隐藏；排班/通知/制度等内部回答不机械替换
  const bannedHit = findBannedWords(answer, bannedWords);
  if (bannedHit.length > 0 && !internalQuery) {
    answer = hideBannedWords(answer, bannedHit);
    answer += "\n\n⚠️ 合规提醒：回答中检测到疑似违规/禁用表达，已自动隐藏。对客户表达时请改为客观、审慎描述。";
  }
  // 价格/政策类（L3）：正常给精准回答，仅附提醒——不再拦截替换
  if (answerType === "need_confirm" && !internalQuery) {
    answer += "\n\n⚠️ 提醒：若涉及具体价格/折扣/退款/活动政策，最终以店长 / 老板确认为准，别擅自承诺。";
  }

  const needsReview = answerType === "risk";

  // 6. 落库 chat_message
  const msg = await db.chat.insertMessage({
    session_id: sessionId,
    store_id: storeId,
    employee_id: ctx.employee.id,
    role,
    user_message: question,
    ai_response: answer,
    retrieved_chunks: retrieved.map((r) => ({ id: r.id, title: r.title, score: r.score })),
    question_category: category,
    risk_level: riskLevel,
    answer_type: answerType,
    needs_review: needsReview,
  });
  await db.chat.touchSession(sessionId);

  // 6b. 客户长记忆落库：本次 AI 建议写入客户互动时间线 + 更新客户最近建议（仅正常回答）
  if (customerId && (answerType === "knowledge" || answerType === "general")) {
    const now = new Date().toISOString();
    try {
      await db.interactions.create({
        store_id: storeId,
        customer_id: customerId,
        employee_id: ctx.employee.id,
        kind: "ai_suggestion",
        channel: "ai",
        title: question.slice(0, 30),
        summary: answer.slice(0, 800),
      });
      await db.customers.update(customerId, storeId, {
        ai_suggestion: answer.slice(0, 2000),
        ai_suggested_at: now,
        last_contact_at: now,
      });
    } catch {
      // 落库失败不影响回答返回
    }
    // 长记忆自动沉淀（旁路）：抽取本轮客户事实写入 memory_items，并按需回写画像/标签。
    // 串行 await 保证闭环可验证；内部已静默吞错，不影响主回答。
    await extractAndPersistMemory(ctx, customerId, question, answer);
  }

  // 7. 副作用：风险记录 / 待确认 / 知识库缺口
  // 管理者（老板/店长）是在「咨询客户怎么处理」，不是一线暴露风险，不记成风险记录
  const isManagerAsking = ["owner", "manager"].includes(ctx.baseRole);
  if (answerType === "risk" && !isManagerAsking) {
    await db.risks.create({
      store_id: storeId,
      employee_id: ctx.employee.id,
      question,
      ai_response: answer,
      risk_type: category,
      risk_level: "L4",
      status: "open",
    });
  } else if (answerType === "need_confirm" && !isManagerAsking) {
    await db.pending.create({
      store_id: storeId,
      employee_id: ctx.employee.id,
      question,
      ai_suggestion: answer,
      category,
      risk_level: "L3",
      status: "pending",
    });
  } else if (answerType === "general") {
    const existing = await db.gaps.findPending(storeId, question);
    if (existing) {
      await db.gaps.setFrequency(existing.id, ((existing.frequency as number) || 1) + 1);
    } else {
      await db.gaps.create({
        store_id: storeId,
        employee_id: ctx.employee.id,
        question,
        category,
        ai_temp_answer: answer,
        status: "pending",
      });
    }
  }

  return {
    messageId: msg.id,
    answer,
    category,
    riskLevel,
    answerType,
    retrieved,
    needsReview,
    bannedHit,
  };
}
