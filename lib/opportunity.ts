// ============================================================
// 增长机会：类型元数据（业务化的 6 类来源 + 升单/补救 + 通用跟进）
// 前端展示与 AI 抽取器共用，避免多处重复。
// ============================================================

export interface OppMeta {
  label: string;
  cls: string; // badge 配色
  hint: string; // 给 AI 的归类说明
}

// 顺序大致按"今日该抓"的业务权重从高到低（仅作默认参考，最终排序见 sortOpps）
export const OPP_TYPE_META: Record<string, OppMeta> = {
  recovery: { label: "服务补救", cls: "bg-red-100 text-red-700", hint: "服务不满/投诉/术后不适，需尽快补救挽回，避免投诉与流失" },
  trial_unclosed: { label: "体验促单", cls: "bg-indigo-100 text-indigo-700", hint: "已体验但未成交，趁热推进转化" },
  new_lead: { label: "新客转化", cls: "bg-sky-100 text-sky-700", hint: "新客咨询过但未转化，需跟进促首单" },
  dormant: { label: "老客唤醒", cls: "bg-amber-100 text-amber-700", hint: "老客长期沉默/很久没到店，需唤醒复购" },
  vip_care: { label: "高客维护", cls: "bg-purple-100 text-purple-700", hint: "高消费/高价值客户，需主动维护与升单" },
  campaign_fit: { label: "活动邀约", cls: "bg-pink-100 text-pink-700", hint: "当前活动适配这位客户，可邀约参与" },
  post_service: { label: "服务回访", cls: "bg-teal-100 text-teal-700", hint: "服务完成后需回访关怀，提升体验与复购" },
  followup: { label: "待跟进", cls: "bg-slate-100 text-slate-600", hint: "通用跟进（如档案设定的下次跟进时间）" },
};

export const OPP_TYPES = Object.keys(OPP_TYPE_META);

export function oppMeta(type: string): OppMeta {
  return OPP_TYPE_META[type] || { label: type || "机会", cls: "bg-slate-100 text-slate-600", hint: "" };
}

// 客户阶段中文
export const STAGE_LABEL: Record<string, string> = {
  new: "新客咨询",
  intent: "意向",
  deal: "已成交",
  regular: "老客",
  churn_risk: "流失风险",
};

// 今日作战室排序权重：业务价值优先；逾期 + 高优先级加权
export function oppWeight(o: any, now = Date.now()): number {
  const typeRank: Record<string, number> = {
    recovery: 60, trial_unclosed: 52, new_lead: 48, dormant: 40,
    vip_care: 38, campaign_fit: 30, post_service: 26, followup: 20,
  };
  let w = typeRank[o.type] ?? 20;
  w += (Number(o.priority) || 0) * 6; // AI 给的紧急度
  if (o.due_at && new Date(o.due_at).getTime() < now) w += 25; // 已逾期，别让客户凉掉
  return w;
}

export function isOverdue(o: any, now = Date.now()): boolean {
  return !!o.due_at && new Date(o.due_at).getTime() < now;
}
