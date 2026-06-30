import { getProvider, callLLM } from "./adapter";
import { db } from "../db";
import { todayRange, fmtDate } from "../format";

// ============================================================
// 门店经营日报（10 段，经营视角；走 lib/ai 适配层）
// 即使数据为 0 也给出下一步建议；AI 使用情况只占其中一小段。
// ============================================================

export interface DailyReportInput {
  storeName: string;
  date: string;
  // 客户与到店
  customerStages: Record<string, number>;
  newCustomers: number;
  // 回访
  followupOpen: number;
  followupDone: number;
  // 反馈 / 未成交原因 / 异常
  feedbackSummary: string[];
  abnormalSamples: string[];
  // 风险 / 缺口 / 待确认
  riskCount: number;
  riskSamples: string[];
  gapCount: number;
  gapSamples: string[];
  pendingCount: number;
  // 通知
  announcements: string[];
  // AI 使用（次要）
  totalQuestions: number;
  activeEmployees: number;
  topCategories: [string, number][];
}

const STAGE_LABEL: Record<string, string> = {
  new: "新客",
  intent: "意向",
  deal: "成交",
  regular: "老客",
  churn_risk: "流失风险",
};

const SECTIONS =
  "今日经营概况 / 客户与到店 / 销售与成交卡点 / 回访与老客跟进 / 服务与接待问题 / 员工痛点与培训 / 风险投诉合规 / 知识库缺口 / AI使用情况 / 明日管理动作";

export async function generateDailyReport(input: DailyReportInput): Promise<string> {
  if (getProvider() === "mock") return mockReport(input);

  const system = `你是资深美容/医美门店经营顾问，为门店老板写一份【门店经营日报】。
用自然语言、口语化、可执行，按这些小标题分段：${SECTIONS}。
重点是经营视角（客户、成交、回访、服务、员工、风险），AI 使用情况只占一小段。
即使某些数据为 0，也要给出有价值的下一步建议；不要堆数字表格，不要编造，不要承诺疗效。`;

  const stageStr = Object.entries(input.customerStages)
    .map(([s, n]) => `${STAGE_LABEL[s] || s}:${n}`)
    .join("、") || "无客户数据";

  const user = [
    `门店：${input.storeName}`,
    `日期：${input.date}`,
    `客户分层：${stageStr}；今日新增客户：${input.newCustomers}`,
    `回访：待办 ${input.followupOpen}，已完成 ${input.followupDone}`,
    `客户反馈/未成交原因：${input.feedbackSummary.join("；") || "无"}`,
    `客户异常/投诉：${input.abnormalSamples.join("；") || "无"}`,
    `高风险问题数：${input.riskCount}；样例：${input.riskSamples.join("；") || "无"}`,
    `知识库缺口数：${input.gapCount}；样例：${input.gapSamples.join("；") || "无"}`,
    `待确认问题数：${input.pendingCount}`,
    `今日通知/培训：${input.announcements.join("；") || "无"}`,
    `AI 使用次数：${input.totalQuestions}；活跃员工：${input.activeEmployees}；高频问题：${input.topCategories.map(([c, n]) => `${c}(${n})`).join("、") || "无"}`,
  ].join("\n");

  try {
    const text = await callLLM({ system, user });
    return text?.trim() || mockReport(input);
  } catch {
    return mockReport(input);
  }
}

function mockReport(i: DailyReportInput): string {
  const out: string[] = [];
  const stageStr =
    Object.entries(i.customerStages).map(([s, n]) => `${STAGE_LABEL[s] || s} ${n} 人`).join("、") || "暂无客户数据";
  const followupTotal = i.followupOpen + i.followupDone;
  const doneRate = followupTotal > 0 ? Math.round((i.followupDone / followupTotal) * 100) : 0;

  out.push("【今日经营概况】");
  out.push(
    `${i.date}，${i.storeName}。客户结构：${stageStr}；今日新增 ${i.newCustomers} 位客户。回访完成率 ${doneRate}%，风险问题 ${i.riskCount} 条，知识库缺口 ${i.gapCount} 个。`
  );
  out.push("");

  out.push("【客户与到店】");
  out.push(
    i.newCustomers > 0
      ? `今日新增 ${i.newCustomers} 位客户，注意安排新客 24 小时回访。`
      : "今日暂无新增客户记录，提醒前台/咨询师及时登记到店客户，避免漏跟。"
  );
  out.push("");

  out.push("【销售与成交卡点】");
  out.push(
    i.customerStages["intent"]
      ? `有 ${i.customerStages["intent"]} 位意向客户待推进，重点跟进价格/效果顾虑，临门一脚别松。`
      : "暂无明确意向客户，建议咨询师主动梳理近期到店客户，挖掘高意向。"
  );
  out.push("");

  out.push("【回访与老客跟进】");
  out.push(
    followupTotal > 0
      ? `回访任务共 ${followupTotal} 条，已完成 ${i.followupDone} 条（${doneRate}%），还有 ${i.followupOpen} 条待跟进。${doneRate < 60 ? "完成率偏低，建议盯一下咨询师回访执行。" : "执行不错，继续保持。"}`
      : "今天没有回访任务，建议把未成交客户和老客按 SOP 排进回访计划。"
  );
  out.push("");

  out.push("【服务与接待问题】");
  out.push(
    i.feedbackSummary.length > 0
      ? `今日客户反馈：${i.feedbackSummary.join("；")}。重点关注未成交原因和价格/效果顾虑，沉淀应对话术。`
      : "今日暂无客户反馈记录，可鼓励员工多登记客户真实反馈，作为改进依据。"
  );
  out.push("");

  out.push("【员工痛点与培训】");
  out.push(
    i.topCategories[0]
      ? `从提问看，员工最常卡在「${i.topCategories[0][0]}」，建议晨会统一口径或安排针对性培训。`
      : "今日员工提问不多，可主动了解一线遇到的客户难题，转化为培训内容。"
  );
  out.push("");

  out.push("【风险投诉合规】");
  out.push(
    i.riskCount > 0 || i.abnormalSamples.length > 0
      ? `今日风险/异常：${[...i.riskSamples, ...i.abnormalSamples].join("；") || `${i.riskCount} 条`}。请尽快复盘处理，皮肤异常/术后/投诉一律升级，不得私自承诺。`
      : "今日无风险或投诉，状态良好。继续保持升级意识。"
  );
  out.push("");

  out.push("【知识库缺口】");
  out.push(
    i.gapCount > 0
      ? `还有 ${i.gapCount} 个缺口${i.gapSamples.length ? "，例如：" + i.gapSamples.join("；") : ""}，建议补充标准答案。`
      : "暂无新缺口，可回顾历史高频问题沉淀标准话术。"
  );
  out.push("");

  out.push("【AI使用情况】");
  out.push(
    i.totalQuestions > 0
      ? `今日 AI 助手被使用 ${i.totalQuestions} 次，活跃员工 ${i.activeEmployees} 人。`
      : "今日 AI 助手使用较少，建议晨会引导员工遇到客户问题先问助手。"
  );
  out.push("");

  out.push("【明日管理动作】");
  const tips: string[] = [];
  if (i.riskCount > 0 || i.abnormalSamples.length > 0) tips.push("优先复盘风险/投诉，并做一次风险培训");
  if (i.followupOpen > 0) tips.push(`督促完成 ${i.followupOpen} 条待回访`);
  if (i.customerStages["intent"]) tips.push("盯紧意向客户的成交推进");
  if (i.gapCount > 0) tips.push("补充知识库缺口对应标准答案");
  if (i.pendingCount > 0) tips.push(`回复 ${i.pendingCount} 个待确认问题`);
  if (i.announcements.length > 0) tips.push("确认今日通知/培训已落实到人");
  if (tips.length === 0) tips.push("运营平稳，重点抓新客登记与回访习惯养成");
  out.push(tips.map((t, idx) => `${idx + 1}. ${t}`).join("\n"));

  return out.join("\n");
}

// ============================================================
// 聚合今日数据 + 生成日报 + 保存（供手动生成和定时 cron 共用）
// ============================================================
export interface StoreLike {
  id: string;
  name: string;
  brand_name?: string | null;
}

export async function buildAndSaveDailyReport(
  store: StoreLike
): Promise<{ text: string; date: string; reportId: string | null }> {
  const storeId = store.id;
  const { start } = todayRange();

  const [meta, openRisks, pendingGaps, pendingCount, anns, custs, fbs, fuStats] = await Promise.all([
    db.chat.listMetaSince(storeId, start),
    db.risks.listOpen(storeId, 5),
    db.gaps.listPending(storeId),
    db.pending.countPending(storeId),
    db.announcements.listActiveNow(storeId),
    db.customers.listByStore(storeId),
    db.feedback.listByStore(storeId, 50),
    db.followups.statsByStore(storeId),
  ]);

  // AI 使用
  const totalQuestions = meta.length;
  const activeEmployees = new Set(meta.map((m: any) => m.employee_id)).size;
  const catCount: Record<string, number> = {};
  for (const m of meta) {
    const c = (m as any).question_category || "其他问题";
    catCount[c] = (catCount[c] || 0) + 1;
  }
  const topCategories = (Object.entries(catCount) as [string, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // 客户分层 + 今日新增
  const customerStages: Record<string, number> = {};
  let newCustomers = 0;
  for (const c of custs as any[]) {
    customerStages[c.stage] = (customerStages[c.stage] || 0) + 1;
    if (c.created_at && c.created_at >= start) newCustomers++;
  }

  // 反馈汇总 + 异常
  const fbCount: Record<string, number> = {};
  const abnormalSamples: string[] = [];
  for (const f of fbs as any[]) {
    fbCount[f.feedback_type] = (fbCount[f.feedback_type] || 0) + 1;
    if (f.risk_flag) abnormalSamples.push(`${f.feedback_type}:${(f.content || "").slice(0, 20)}`);
  }
  const feedbackSummary = Object.entries(fbCount).map(([t, n]) => `${t}x${n}`);

  const date = fmtDate(new Date().toISOString());

  const text = await generateDailyReport({
    storeName: store.brand_name || store.name,
    date,
    customerStages,
    newCustomers,
    followupOpen: fuStats.open,
    followupDone: fuStats.done,
    feedbackSummary,
    abnormalSamples: abnormalSamples.slice(0, 5),
    riskCount: meta.filter((m: any) => m.risk_level === "L4").length,
    riskSamples: (openRisks as any[]).slice(0, 3).map((r) => r.question),
    gapCount: pendingGaps.length,
    gapSamples: (pendingGaps as any[]).slice(0, 3).map((g) => g.question),
    pendingCount,
    announcements: (anns as any[]).map((a) => `[${a.announcement_type}]${a.title}`),
    totalQuestions,
    activeEmployees,
    topCategories,
  });

  let reportId: string | null = null;
  try {
    const rec = await db.reports.create({
      store_id: storeId,
      report_type: "daily",
      date_range: date,
      content: { text, totalQuestions, activeEmployees, newCustomers, followupOpen: fuStats.open },
    });
    reportId = rec.id;
  } catch {
    // 保存失败不影响返回
  }

  return { text, date, reportId };
}
