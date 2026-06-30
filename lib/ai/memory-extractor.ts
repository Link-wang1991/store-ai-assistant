import { db } from "../db";
import { callLLM, getProvider } from "./adapter";
import { OPP_TYPES, OPP_TYPE_META } from "../opportunity";
import { sanitizeScript } from "./compliance";
import type { AuthContext } from "../types";

// ============================================================
// 长记忆 + 增长机会自动沉淀（门店专属 Hermes 第三阶段·第 1、2 项）
// 旁路（side-channel）：在主回答返回后调用，绝不影响给员工的回答。
// 职责：把 [本轮问题 + AI回答 + 现有画像] 喂给一个轻量"抽取" prompt，
//       让模型只吐 JSON，一次调用同时产出：
//   1. memory_points 全量 upsert 进 memory_items（带 confidence/source）
//   2. profile_patch / tags_add 仅在「高置信 + 当前字段为空」时回写 customer_records
//   3. opportunities upsert 进 growth_opportunities（同客户同类型去重，作战室统一展示）
// 任何异常静默吞掉——沉淀是增益，不是主流程。
// ============================================================

// 回写画像的置信度阈值：低于此值只进 memory_items，不动画像展示字段
const PROFILE_WRITE_THRESHOLD = 0.75;

// 允许 AI 回写的画像文本字段（与 v5 customer_records 对齐）
const PROFILE_FIELDS = [
  "personality",
  "spending_power",
  "decision_style",
  "communication_pref",
  "concerns",
  "repurchase_opp",
] as const;
type ProfileField = (typeof PROFILE_FIELDS)[number];

interface MemoryPoint {
  key: string;
  value: string;
  confidence?: number;
}
interface OpportunityItem {
  type: string;
  title: string;
  reason?: string; // 为什么值得跟
  blocker?: string; // 当前阻碍
  opening?: string; // 建议怎么开口（话术）
  goal?: string; // 下一步目标
  priority?: number; // 0~3，越大越紧急
  due_in_days?: number; // 建议几天内跟进
}
interface ExtractResult {
  memory_points?: MemoryPoint[];
  profile_patch?: Partial<Record<ProfileField, string>>;
  tags_add?: string[];
  opportunities?: OpportunityItem[];
}

const FIELD_HINT = `性格底色(personality)、消费能力(spending_power: 高/中/低)、决策风格(decision_style)、沟通偏好(communication_pref)、当前顾虑/成交阻碍(concerns)、复购或升单机会(repurchase_opp)`;

// 6 类来源 + 升单/补救/通用，喂给 AI 的归类清单
const OPP_TYPE_LIST = OPP_TYPES.map((k) => `${k}（${OPP_TYPE_META[k].hint}）`).join("、");

function buildExtractPrompt(question: string, answer: string, profileText: string): { system: string; user: string } {
  const system = `你是门店客户记忆抽取器。从一轮员工提问与 AI 回答里，把「关于这位客户本人的、值得长期记住的事实」结构化沉淀下来。
要抽的事实类型：决策链（谁拍板）、顾虑/成交阻碍、预算/消费信号、偏好、禁忌、关键生活事件、已承诺过的事。
严格要求：
1. 只输出 JSON，不要任何解释或 markdown 代码块标记。
2. 只抽客户本人的真实情况；绝不把员工动作、AI 的建议话术当成客户事实；原文没出现的不要猜。
3. memory_points 要尽量抽全本轮对话体现的客户事实——即使「已知画像」里已经有，只要本轮被再次印证，也要作为一条 memory_point 沉淀（这是记忆库，按 key 去重，重复印证有价值）。
4. confidence 取 0~1，如实反映把握程度。
5. 确实没有任何可沉淀的客户事实时，才给空数组/空对象。
6. memory_points 的 key 用稳定英文短标识（如 decision_maker / concern / budget_signal / preference / taboo / life_event），value 用简体中文一句话。
7. profile_patch 仅在能高置信归类到这些画像字段时给出：${FIELD_HINT}（用于补全门店尚未填写的画像，已填的会被系统保护、不必担心覆盖）。
8. tags_add 是 1~4 字的中文短标签（如 "怕推销"、"高意向"），最多 4 个。
9. opportunities 抽取本轮体现的、值得门店主动跟进的「增长机会」，每条是一张可执行的成交/复购卡，含 type、title、reason、blocker、opening、goal、priority(0~3)、due_in_days：
   - type 按来源归类，只能取：${OPP_TYPE_LIST}。
   - title：一句话点明要做什么（如"补水疗程升单"）。
   - reason：为什么值得跟（这位客户为何是机会）。
   - blocker：当前阻碍/成交障碍（没有就省略）。
   - opening：建议员工怎么开口的话术（会被员工直接拿去对客，必须比平时更保守）。严禁承诺疗效或用绝对化表达，绝不能出现"明显改善/一次见效/做一次就能看到效果/效果好不好自己看得见/保证有效/无风险"这类话；只描述客观、审慎、因人而异。
   - goal：这次跟进要达成的下一步目标（如"约到店体验""完成复购"）。
   - priority 越大越紧急；due_in_days 建议几天内跟进。
   - 没有明确机会就给空数组，不要硬凑；同一客户同一 type 只给最关键的一条。

输出格式：
{"memory_points":[{"key":"decision_maker","value":"需和老公商量后才拍板","confidence":0.9}],"profile_patch":{"decision_style":"需家人同意"},"tags_add":["怕推销"],"opportunities":[{"type":"trial_unclosed","title":"带体验单推进成交","reason":"已体验有兴趣，高意向","blocker":"需和老公商量、怕没效果","opening":"姐，您上次体验后皮肤状态明显透亮了些，要不先约个时间我帮您把效果对比拍下来，您回去也好和家人商量","goal":"约到店并推进首单","priority":2,"due_in_days":3}]}`;

  const user = `【这位客户已知画像】
${profileText || "（暂无）"}

【员工提问】
${question}

【AI 回答】
${answer}

请把本轮对话体现的客户事实结构化抽取出来，按规定 JSON 输出。`;
  return { system, user };
}

// 从模型输出里稳健提取第一个 JSON 对象
function parseJson(raw: string): ExtractResult | null {
  if (!raw) return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as ExtractResult;
  } catch {
    return null;
  }
}

function profileLines(cust: any): string {
  const map: Array<[ProfileField, string]> = [
    ["personality", "性格底色"],
    ["spending_power", "消费能力"],
    ["decision_style", "决策风格"],
    ["communication_pref", "沟通偏好"],
    ["concerns", "当前顾虑"],
    ["repurchase_opp", "复购/升单机会"],
  ];
  const lines = map.filter(([f]) => cust[f]).map(([f, label]) => `${label}：${cust[f]}`);
  if (Array.isArray(cust.tags) && cust.tags.length) lines.push(`标签：${cust.tags.join("、")}`);
  return lines.join("\n");
}

export async function extractAndPersistMemory(
  ctx: AuthContext,
  customerId: string,
  question: string,
  answer: string
): Promise<void> {
  // mock provider 下无真实模型，跳过抽取（保证无 key 也能 build/跑通主流程）
  if (getProvider() === "mock") return;

  try {
    const cust: any = await db.customers.getById(customerId, ctx.store.id);
    if (!cust) return;

    const { system, user } = buildExtractPrompt(question, answer, profileLines(cust));
    const raw = await callLLM({ system, user });
    const result = parseJson(raw);
    if (!result) return;

    const storeId = ctx.store.id;

    // 1) memory_points 全量落库（带置信度与来源）
    for (const p of result.memory_points || []) {
      if (!p?.key || !p?.value) continue;
      await db.memory.upsert({
        store_id: storeId,
        scope: "customer",
        ref_id: customerId,
        key: String(p.key).slice(0, 60),
        value: String(p.value).slice(0, 500),
        confidence: typeof p.confidence === "number" ? p.confidence : undefined,
        source: "ai_extract",
      });
    }

    // 2) 画像回写：仅高置信，且仅填空、不覆盖已有人工/历史画像
    const patch: Record<string, any> = {};
    const conf = (() => {
      const cs = (result.memory_points || [])
        .map((p) => p.confidence)
        .filter((c): c is number => typeof c === "number");
      return cs.length ? Math.max(...cs) : 0;
    })();

    if (result.profile_patch && conf >= PROFILE_WRITE_THRESHOLD) {
      for (const f of PROFILE_FIELDS) {
        const v = result.profile_patch[f];
        if (v && !cust[f]) patch[f] = String(v).slice(0, 200); // 仅当当前为空才补
      }
    }

    // 3) tags 合并去重（标签是低风险增量，置信门槛放宽）
    if (Array.isArray(result.tags_add) && result.tags_add.length) {
      const existing: string[] = Array.isArray(cust.tags) ? cust.tags : [];
      const merged = Array.from(
        new Set([...existing, ...result.tags_add.map((t) => String(t).trim()).filter(Boolean)])
      ).slice(0, 20);
      if (merged.length !== existing.length) patch.tags = merged;
    }

    if (Object.keys(patch).length) {
      await db.customers.update(customerId, storeId, patch);
    }

    // 4) 增长机会 upsert（同客户同类型去重，作战室统一展示）
    for (const o of result.opportunities || []) {
      if (!o?.type || !o?.title) continue;
      if (!OPP_TYPES.includes(o.type)) continue;
      const priority = Math.max(0, Math.min(3, Math.round(Number(o.priority) || 1)));
      const days = Number(o.due_in_days);
      const due_at =
        Number.isFinite(days) && days >= 0
          ? new Date(Date.now() + days * 86400000).toISOString()
          : null;
      const clip = (s: any, n: number) => (s ? String(s).slice(0, n) : null);
      // opening 会被员工直接对客，写入前做合规清洗（比主回答更严）
      const safeOpening = sanitizeScript(o.opening).text;
      await db.opportunities.upsertOpen({
        store_id: storeId,
        customer_id: customerId,
        employee_id: ctx.employee.id,
        type: o.type,
        title: String(o.title).slice(0, 120),
        reason: clip(o.reason, 300),
        blocker: clip(o.blocker, 300),
        opening: safeOpening ? safeOpening.slice(0, 400) : null,
        goal: clip(o.goal, 200),
        priority,
        due_at,
        source: "ai_extract",
      });
    }
  } catch {
    // 沉淀失败不影响已返回的主回答
  }
}
