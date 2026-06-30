import { db } from "../db";
import { callLLM, getProvider } from "./adapter";
import { STAGE_LABEL } from "../opportunity";
import type { AuthContext } from "../types";

// ============================================================
// 门店级长记忆沉淀（store scope memory）
// 触发：一个增长机会被标记「完成/成交」时。
// 把「什么类型客户 + 什么动作/话术 + 达成了什么」提炼成一条门店可复用经验，
// 写入 memory_items(scope='store')，反哺全店——让 AI 越用越懂这家店。
// 旁路：mock 跳过；任何异常静默吞掉，不影响完成机会的主操作。
// ============================================================

interface DistillResult {
  category?: string; // winning_script / hard_to_close / campaign_feedback / general
  key?: string;
  value?: string;
  skip?: boolean;
}

function parseJson(raw: string): DistillResult | null {
  if (!raw) return null;
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try {
    return JSON.parse(raw.slice(s, e + 1)) as DistillResult;
  } catch {
    return null;
  }
}

export async function distillStoreExperience(ctx: AuthContext, opp: any): Promise<void> {
  if (getProvider() === "mock" || !opp) return;
  try {
    const c = opp.customer_records || {};
    const profile = [
      c.stage && `阶段：${STAGE_LABEL[c.stage] || c.stage}`,
      c.personality && `性格：${c.personality}`,
      c.decision_style && `决策：${c.decision_style}`,
      c.spending_power && `消费力：${c.spending_power}`,
      c.concerns && `顾虑：${c.concerns}`,
      Array.isArray(c.tags) && c.tags.length && `标签：${c.tags.join("、")}`,
    ].filter(Boolean).join("；") || "（无画像）";

    const oppText = [
      `类型：${opp.type}`,
      `动作：${opp.title}`,
      opp.reason && `判断依据：${opp.reason}`,
      opp.blocker && `当时阻碍：${opp.blocker}`,
      opp.opening && `用过的话术：${opp.opening}`,
      opp.goal && `目标：${opp.goal}`,
    ].filter(Boolean).join("；");

    const system = `你是门店经营经验提炼器。一个增长机会刚被标记「完成/达成」。请把"什么类型的客户 + 什么动作或话术 + 达成了什么"提炼成一条【门店可复用的经营经验】，供全店所有员工以后参考。
只输出 JSON：{"category":"winning_script|hard_to_close|campaign_feedback|general","key":"category:简短场景标识","value":"一句可复用的门店经验"}。
要求：
1. value 是门店级经验（面向"这一类客户"，不是针对某个人），客观、可操作。
2. 严禁承诺疗效或绝对化表达；话术类经验要保守、合规。
3. key 用"类别:场景"形式（如 winning_script:需家人同意型、hard_to_close:怕推销型），便于同场景更新。
4. 没有值得沉淀的普适经验就输出 {"skip":true}。`;

    const user = `【客户画像】${profile}\n【刚完成的机会】${oppText}`;
    const raw = await callLLM({ system, user });
    const r = parseJson(raw);
    if (!r || r.skip || !r.key || !r.value) return;

    await db.memory.upsert({
      store_id: ctx.store.id,
      scope: "store",
      ref_id: ctx.store.id,
      key: String(r.key).slice(0, 80),
      value: String(r.value).slice(0, 500),
      confidence: 0.7,
      source: "ai_distill",
    });
  } catch {
    // 沉淀失败不影响完成机会
  }
}
