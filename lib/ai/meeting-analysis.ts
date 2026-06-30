import { db } from "../db";
import { callLLM, getProvider } from "./adapter";
import { sanitizeScript } from "./compliance";
import { OPP_TYPES } from "../opportunity";
import { SCENE_LABEL } from "../scenes";
import type { AuthContext } from "../types";

// ============================================================
// 会谈复盘分析：转写文本 + 客户画像 + 场景 → 结构化复盘 →
// 沉淀客户/员工/门店记忆 + 增长机会 + 风险 + 回写客户档案。
// 录音是入口，分析是价值，沉淀是壁垒。
// 原则：精炼、只说有依据的，没有的就留空，不为填满模板而编造。
// ============================================================

interface MemoryPoint { key: string; value: string }
interface AnalysisJson {
  speaker_roles?: Record<string, string>;
  summary?: string; key_points?: string;
  explicit_needs?: string; implicit_needs?: string; emotional_needs?: string;
  decision_barriers?: string; customer_personality?: string; customer_comm_pref?: string;
  customer_spending_power?: string; employee_did_well?: string; employee_to_improve?: string;
  missed_opportunities?: string; service_experience_risk?: string; compliance_risks?: string;
  followup_goal?: string; suggested_followup_in_days?: number; suggested_script?: string;
  need_manager_involved?: boolean;
  memory_to_create?: { customer?: MemoryPoint[]; employee?: MemoryPoint[]; store?: MemoryPoint[] };
  opportunities?: any[];
}

function parseJson(raw: string): AnalysisJson | null {
  if (!raw) return null;
  const s = raw.indexOf("{"); const e = raw.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(raw.slice(s, e + 1)); } catch { return null; }
}

const SCHEMA = `{
 "speaker_roles": {"speaker_0":"employee 或 customer 或 manager 或 other", "speaker_1":"..."},
 "summary":"会谈摘要",
 "key_points":"谈话重点提炼",
 "explicit_needs":"客户显性需求",
 "implicit_needs":"客户隐性需求",
 "emotional_needs":"客户情绪需求",
 "decision_barriers":"客户决策阻碍",
 "customer_personality":"客户性格底色",
 "customer_comm_pref":"客户沟通偏好",
 "customer_spending_power":"高/中/低 及依据",
 "employee_did_well":"员工沟通做得好的地方",
 "employee_to_improve":"员工沟通存在的问题",
 "missed_opportunities":"错失的成交/复购机会",
 "service_experience_risk":"服务体验风险，无则写无",
 "compliance_risks":"合规风险（疗效承诺/绝对化/越界医疗判断等），无则写无",
 "followup_goal":"下一步跟进目标",
 "suggested_followup_in_days":3,
 "suggested_script":"建议话术，可直接对客说，合规不承诺疗效",
 "need_manager_involved":false,
 "memory_to_create":{"customer":[{"key":"concern","value":"一句话"}],"employee":[{"key":"skill_gap","value":""}],"store":[{"key":"winning_script","value":""}]},
 "opportunities":[{"type":"trial_unclosed","title":"","reason":"","blocker":"","opening":"合规话术","goal":"","priority":2,"due_in_days":3}]
}`;

export async function analyzeMeeting(ctx: AuthContext, meetingId: string): Promise<void> {
  const storeId = ctx.store.id;
  const meeting: any = await db.meetings.getById(meetingId, storeId);
  if (!meeting) throw new Error("会谈不存在");

  if (getProvider() === "mock") {
    await db.meetings.update(meetingId, storeId, { analysis_status: "failed" });
    throw new Error("当前为 mock 模式，无法分析（请配置 AI_PROVIDER）");
  }

  const trans = (await db.meetingTranscripts.listByMeeting(meetingId, storeId)) as any[];
  if (!trans.length) throw new Error("没有转写内容可分析");

  // 长会谈：保留更多内容（模型上下文足够）；过长时保头尾，避免丢失开场需求与收尾承诺
  const fullTranscript = trans.map((t) => `[${t.speaker}] ${t.content}`).join("\n");
  const MAX = 30000;
  const transcriptText =
    fullTranscript.length <= MAX
      ? fullTranscript
      : fullTranscript.slice(0, 20000) + "\n…（中间略）…\n" + fullTranscript.slice(-10000);

  const cust = meeting.customer_records || {};
  const profile = [
    cust.stage && `阶段:${cust.stage}`, cust.personality && `性格:${cust.personality}`,
    cust.decision_style && `决策:${cust.decision_style}`, cust.spending_power && `消费力:${cust.spending_power}`,
    cust.concerns && `已知顾虑:${cust.concerns}`,
  ].filter(Boolean).join("；") || "（无画像）";

  const system = `你是门店会谈复盘分析师。基于一段真实会谈的转写（含说话人标识 speaker_0/1…），结合客户已知画像，产出复盘报告。
要求：
1. 先**通读整段对话**再判断每个 speaker 的真实角色，填进 speaker_roles：一般【主动介绍项目/报价/讲解流程或恢复期/推销/招呼并称呼对方"X总/X姐/帅哥美女"】的是 employee；【来咨询、问价格、说出自己想做什么、表达需求与顾虑、被称呼】的是 customer。务必结合上下文整体判断，不要只看单句就定角色（同一个人多句话角色应一致）。
2. 客观、专业；涉及皮肤/健康只如实记录，不做医疗诊断；建议话术与机会话术不得承诺疗效或绝对化。
3. **精炼**：每项直说结论，能一句话就别两句，不堆砌、不重复、不说套话。
4. **实事求是**：只写这段对话里**确实有依据**的内容。某一项在对话里没有体现，就把该字段**留空（空字符串）**，不要为了填满模板而推测、编造或硬套标签。宁可少写。（例外：service_experience_risk、compliance_risks 两项若确实没有，写"无"。）
5. **重点挖「没被发现的」（复盘最有价值的部分）**：除了对话里明说的，要进一步推断客户**没说出口、甚至员工当场都没意识到**的潜在痛点、深层动机、被错过的机会，填进 implicit_needs / emotional_needs / missed_opportunities。这是这份复盘最值钱的地方——但仍须基于对话有合理依据，不凭空编。
6. opportunities 只在真有可跟进机会时给，没有就给空数组；type 只能取：${OPP_TYPES.join("、")}。
7. 只输出 JSON，不要解释。schema（各文本字段没有就留空）：
${SCHEMA}`;

  const user = `【会谈场景】${SCENE_LABEL[meeting.scene] || meeting.scene || "未指定"}
【客户画像】${profile}
【会谈转写】
${transcriptText}`;

  let raw: string;
  try {
    raw = await callLLM({ system, user });
  } catch (e: any) {
    await db.meetings.update(meetingId, storeId, { analysis_status: "failed" });
    throw new Error("分析调用失败：" + (e.message || ""));
  }
  const a = parseJson(raw);
  if (!a) {
    await db.meetings.update(meetingId, storeId, { analysis_status: "failed" });
    throw new Error("分析结果解析失败");
  }

  const employeeId = meeting.employee_id;
  const customerId = meeting.customer_id;
  const now = Date.now();
  const days = Number(a.suggested_followup_in_days);
  const followAt = Number.isFinite(days) && days >= 0 ? new Date(now + days * 86400000).toISOString() : null;
  const safeScript = a.suggested_script ? sanitizeScript(a.suggested_script).text : null;

  // 把数组/对象规整成多行文本，避免存成 ["..","..']
  const S = (v: any): string | null => {
    if (v == null) return null;
    if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? `· ${x}` : JSON.stringify(x))).join("\n") || null;
    return String(v) || null;
  };

  // 1) 存分析报告
  await db.meetingAnalysis.create({
    meeting_id: meetingId, store_id: storeId, customer_id: customerId, employee_id: employeeId,
    summary: S(a.summary), key_points: S(a.key_points),
    explicit_needs: S(a.explicit_needs), implicit_needs: S(a.implicit_needs),
    emotional_needs: S(a.emotional_needs), decision_barriers: S(a.decision_barriers),
    customer_personality: S(a.customer_personality), customer_comm_pref: S(a.customer_comm_pref),
    customer_spending_power: S(a.customer_spending_power),
    employee_did_well: S(a.employee_did_well), employee_to_improve: S(a.employee_to_improve),
    missed_opportunities: S(a.missed_opportunities),
    service_experience_risk: S(a.service_experience_risk), compliance_risks: S(a.compliance_risks),
    followup_goal: S(a.followup_goal), suggested_followup_at: followAt,
    suggested_script: safeScript, need_manager_involved: !!a.need_manager_involved,
    memory_to_create: a.memory_to_create || null,
  });

  // 2) 说话人角色回写转写
  if (a.speaker_roles) {
    for (const [sp, role] of Object.entries(a.speaker_roles)) {
      try { await db.meetingTranscripts.setSpeakerRole(meetingId, storeId, sp, String(role)); } catch {}
    }
  }

  // 3) 沉淀记忆：客户 / 员工 / 门店
  const mem = a.memory_to_create || {};
  const upMem = async (scope: string, refId: string | null, pts?: MemoryPoint[]) => {
    if (!refId || !Array.isArray(pts)) return;
    for (const p of pts) {
      if (!p?.key || !p?.value) continue;
      try {
        await db.memory.upsert({
          store_id: storeId, scope, ref_id: refId,
          key: String(p.key).slice(0, 80), value: String(p.value).slice(0, 500),
          confidence: 0.8, source: "meeting",
        });
      } catch {}
    }
  };
  await upMem("customer", customerId, mem.customer);
  await upMem("employee", employeeId, mem.employee);
  await upMem("store", storeId, mem.store);

  // 4) 增长机会
  for (const o of a.opportunities || []) {
    if (!o?.type || !o?.title || !customerId) continue;
    if (!OPP_TYPES.includes(o.type)) continue;
    const priority = Math.max(0, Math.min(3, Math.round(Number(o.priority) || 1)));
    const odays = Number(o.due_in_days);
    const due = Number.isFinite(odays) && odays >= 0 ? new Date(now + odays * 86400000).toISOString() : followAt;
    try {
      await db.opportunities.upsertOpen({
        store_id: storeId, customer_id: customerId, employee_id: employeeId,
        type: o.type, title: String(o.title).slice(0, 120),
        reason: o.reason ? String(o.reason).slice(0, 300) : null,
        blocker: o.blocker ? String(o.blocker).slice(0, 300) : null,
        opening: o.opening ? sanitizeScript(String(o.opening)).text.slice(0, 400) || null : null,
        goal: o.goal ? String(o.goal).slice(0, 200) : null,
        priority, due_at: due, source: "meeting",
      });
    } catch {}
  }

  // 5) 风险写 risk_logs（服务体验 / 合规，非"无"才写）
  const hasRisk = (s?: string) => s && !/^无$|^没有|^暂无/.test(s.trim());
  const riskParts: string[] = [];
  if (hasRisk(a.service_experience_risk)) riskParts.push("服务体验：" + a.service_experience_risk);
  if (hasRisk(a.compliance_risks)) riskParts.push("合规：" + a.compliance_risks);
  if (riskParts.length) {
    try {
      await db.risks.create({
        store_id: storeId, employee_id: employeeId,
        question: `[会谈风险] ${cust.name || "客户"}`,
        ai_response: riskParts.join("\n"),
        risk_type: hasRisk(a.compliance_risks) ? "合规表达" : "服务体验",
        risk_level: a.need_manager_involved ? "L3" : "L2", status: "open",
      });
    } catch {}
  }

  // 6) 回写客户档案：画像仅填空 + 下次跟进
  if (customerId) {
    const patch: Record<string, any> = { last_contact_at: new Date().toISOString() };
    if (a.customer_personality && !cust.personality) patch.personality = String(a.customer_personality).slice(0, 200);
    if (a.customer_comm_pref && !cust.communication_pref) patch.communication_pref = String(a.customer_comm_pref).slice(0, 200);
    if (a.customer_spending_power && !cust.spending_power) patch.spending_power = String(a.customer_spending_power).slice(0, 50);
    if (followAt) patch.next_follow_at = followAt;
    try { await db.customers.update(customerId, storeId, patch); } catch {}
  }

  await db.meetings.update(meetingId, storeId, { analysis_status: "done", status: "done" });
}
