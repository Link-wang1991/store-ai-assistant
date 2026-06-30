// ============================================================
// AI 客户机会池：把客户按"今天该怎么对待"分进 6 个池，
// 并为每个客户生成机会卡洞察（为什么进池 / AI判断 / 推荐话术 / 下一步）。
// 注：当前 schema 无到店流水/消费额字段，这里用 stage / concerns / next_follow_at
// 做规则化近似，属产品原型；接入真实到店与消费数据后可替换 assignPool / poolInsight。
// ============================================================

export interface PoolMeta {
  code: string;
  label: string;
  desc: string;
}

// 机会卡所需的客户视图（server 端组装好传给卡片）
export interface PoolCustomer {
  id: string;
  name: string;
  stage: string;
  stageLabel: string;
  assigneeLabel: string;
  lastActive: string; // 已格式化的"上次互动"
  ownerVisible: boolean;
  concerns?: string | null;
  ai_suggestion?: string | null;
  importInsight?: {
    segment?: string;
    confidence?: number;
    source?: string;
    evidence?: string[];
    tags?: string[];
    aiJudge?: string;
    nextAction?: string;
    script?: string;
    riskNote?: string;
    needsReview?: boolean;
    reviewReasons?: string[];
    dataCompleteness?: number;
    version?: string;
  } | null;
  pool: string;
  lastVisitDays?: number | null; // 距今多少天没到店（用于工作台显示与沉睡判断）
  nextFollowLabel?: string | null; // 下次跟进时间（已格式化）
}

// 今日工作台优先级：值越大越该今天处理。
// 风险 > 今日到店 > 新成交(交付回访) > 沉睡(待唤醒) > 新客 > 老客(维护期·不进今日清单)
export const POOL_PRIORITY: Record<string, number> = {
  risk: 5, today: 4, new_deal: 3, dormant: 2, new: 1, regular: 0,
};

// 阶段判定阈值（天）。可由门店在配置里调整后传入 assignPool。
export interface PoolThresholds {
  dormantDays: number; // 超过这么多天没到店 = 沉睡待唤醒
  newDealDays: number; // 成交后这么多天内 = 新成交（交付回访期）
}
export const DEFAULT_THRESHOLDS: PoolThresholds = { dormantDays: 60, newDealDays: 7 };

// 客户阶段判定标准（以「最近到店日期 last_visit_at」为客观准绳，供 UI 向员工说明）
export function stageStandard(t: PoolThresholds = DEFAULT_THRESHOLDS): { label: string; rule: string }[] {
  return [
    { label: "新客", rule: "还没有到店记录" },
    { label: "今日到店", rule: "今天到店或今天有约访" },
    { label: "新成交", rule: `${t.newDealDays} 天内成交，重点做交付回访` },
    { label: "活跃老客", rule: `${t.dormantDays} 天内到过店` },
    { label: "沉睡", rule: `超过 ${t.dormantDays} 天没到店，需低压力唤醒` },
    { label: "风险", rule: "有顾虑/不满信号，优先补救" },
  ];
}

// code 为系统逻辑用，label 为展示用（后续可在「自定义配置」里改 label）
export const CUSTOMER_POOLS: PoolMeta[] = [
  { code: "today", label: "今日到店", desc: "今天有约访/到店，重点当面推进" },
  { code: "new", label: "新客", desc: "新进咨询，先建立信任再促首单" },
  { code: "new_deal", label: "新成交", desc: "刚成交，做好交付决定复购" },
  { code: "regular", label: "老客", desc: "稳定到店，维护关系找升单点" },
  { code: "dormant", label: "沉睡", desc: "久未到店，低压力唤醒复访" },
  { code: "risk", label: "风险", desc: "有顾虑/不满，先补救避免流失" },
];

export const POOL_LABEL: Record<string, string> = Object.fromEntries(
  CUSTOMER_POOLS.map((p) => [p.code, p.label])
);

function isToday(iso?: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
function isRecent(iso?: string | null, days = 7): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < days * 86400000;
}
function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return ms < 0 ? 0 : Math.floor(ms / 86400000);
}

// 一个客户只进一个主池。判定以「最近到店日期」为客观准绳：
// 风险 > 今日到店 > 新成交(交付回访) > 沉睡 > 新客 > 老客(维护期)
export function assignPool(c: any, t: PoolThresholds = DEFAULT_THRESHOLDS): string {
  if (c.concerns && String(c.concerns).trim()) return "risk";
  // 今日到店：真实到店（last_visit_at 是今天）或今天有约访
  if (isToday(c.last_visit_at) || isToday(c.next_follow_at)) return "today";
  // 新成交：近 newDealDays 天成交 → 交付回访期（必须有成交日期，旧 deal 不再永久占此池）
  if (c.stage === "deal" && isRecent(c.last_deal_at, t.newDealDays)) return "new_deal";
  // 沉睡：显式流失风险，或「有过到店但超阈值未再到店」
  if (c.stage === "churn_risk") return "dormant";
  const since = daysSince(c.last_visit_at);
  if (since !== null && since > t.dormantDays) return "dormant";
  // 新客：还没有任何到店记录（且非成交）
  if (since === null && c.stage !== "deal") return "new";
  // 其余：阈值内到过店 = 活跃老客；成交已久 = 老客维护期
  return "regular";
}

// 进池依据的人话说明（给机会卡/客户页展示，让员工明白为什么这样判定）
export function poolReason(c: any, pool: string, t: PoolThresholds = DEFAULT_THRESHOLDS): string {
  const since = daysSince(c.last_visit_at);
  if (pool === "dormant" && since !== null) return `已 ${since} 天没到店（超 ${t.dormantDays} 天）`;
  if (pool === "new") return "还没有到店记录，先建立信任";
  if (pool === "new_deal") return "近期刚成交，做好交付回访";
  if (pool === "today") return isToday(c.last_visit_at) ? "今天到店" : "今天有约访";
  if (pool === "regular" && since !== null) return `${since} 天前到过店，活跃老客`;
  return "";
}

export interface PoolInsight {
  reason: string; // 为什么进这个池
  aiJudge: string; // AI 判断
  script: string; // 推荐话术
  nextAction: string; // 下一步动作
  evidence?: string[];
  confidence?: number | null;
  riskNote?: string | null;
  needsReview?: boolean;
  reviewReasons?: string[];
}

// 机会卡洞察（规则原型 + 导入结构化洞察；导入洞察优先，因为它带原始证据和动作建议）
export function poolInsight(c: any, pool: string): PoolInsight {
  const name = c.name || "客户";
  const concern = (c.concerns && String(c.concerns).trim()) || "";
  const base: Record<string, PoolInsight> = {
    today: {
      reason: "今天已约访/到店，是当面推进的最好时机",
      aiJudge: "到店当面沟通的转化远高于线上，今天别只接待、要主动推进一步",
      script: `${name}，您今天来得正好，我先帮您看下上次的情况，给您一个更合适的方案～`,
      nextAction: "接待时确认核心需求，顺势推进项目或复购",
    },
    new: {
      reason: "新进咨询、尚未成交，信任还没建立",
      aiJudge: "新客别急着推卡，先做价值铺垫和案例展示，降低戒备",
      script: `您是第一次了解我们，我先不急着推荐，先帮您分析下您最关心的问题～`,
      nextAction: "加微信、发同类案例，约一次低门槛体验",
    },
    new_deal: {
      reason: "近期刚成交，交付体验决定会不会复购",
      aiJudge: "成交不是结束，做好首次交付和回访才能撬动复购与转介绍",
      script: `恭喜您选了这个项目，做完我会把注意事项一条条跟您说清楚，放心～`,
      nextAction: "服务后 24 小时回访，记录真实反馈",
    },
    regular: {
      reason: "稳定到店的老客，关系维护与升单兼顾",
      aiJudge: "老客重在被记住和被在意，关怀之上自然带出适配的新项目",
      script: `${name}，最近您的状态我一直有关注，给您搭配了一个更省心的方案～`,
      nextAction: "做一次主动关怀，推荐 1 个适配新项目",
    },
    dormant: {
      reason: "长期未到店 / 有流失风险，需要唤醒",
      aiJudge: "沉睡客户怕被催，要低压力唤醒：先关心、再给理由回来",
      script: `${name}，好久没见啦～最近店里有个挺适合您的安排，想着第一时间告诉您。`,
      nextAction: "发一条轻关怀触达，邀约回访（不催单）",
    },
    risk: {
      reason: concern ? `存在顾虑：${concern}` : "有不满/顾虑信号，需及时补救",
      aiJudge: "有顾虑时先处理情绪和问题，补救到位之前不要谈成交",
      script: `您之前提到的问题我特别上了心，已经帮您安排好处理，您看这样可以吗？`,
      nextAction: "尽快处理顾虑、闭环反馈，避免投诉与流失",
    },
  };
  const r = base[pool] || base.regular;
  const insight = c.importInsight || c.import_raw?.insight;
  if (insight && typeof insight === "object") {
    return {
      ...r,
      reason: insight.segment ? `${r.reason} · ${insight.segment}` : r.reason,
      aiJudge: String(insight.aiJudge || c.ai_suggestion || r.aiJudge).trim(),
      script: String(insight.script || r.script).trim(),
      nextAction: String(insight.nextAction || r.nextAction).trim(),
      evidence: Array.isArray(insight.evidence) ? insight.evidence.slice(0, 2) : undefined,
      confidence: typeof insight.confidence === "number" ? insight.confidence : null,
      riskNote: insight.riskNote || (insight.needsReview && insight.reviewReasons?.length ? `需补充：${insight.reviewReasons.join("、")}` : null),
      needsReview: !!insight.needsReview,
      reviewReasons: Array.isArray(insight.reviewReasons) ? insight.reviewReasons : undefined,
    };
  }
  // 客户档案里已有 AI 跟进建议时，用作更具体的 AI 判断
  if (c.ai_suggestion && String(c.ai_suggestion).trim()) {
    return { ...r, aiJudge: String(c.ai_suggestion).trim() };
  }
  return r;
}
