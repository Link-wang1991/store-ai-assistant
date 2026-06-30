// ============================================================
// 客户名单·自然语言解析：从「客户情况说明 / 跟进重点」等自由文本里，
// 智能抽取「多久没到店」和「第N天跟进计划」，让低门槛导入也能产生提醒。
// 原则：解析不出就返回空，绝不臆造。
// ============================================================

// 从文本里抽「距今未到店天数」：支持「45天未到店 / 中断30天 / 护理节奏中断30天 / 未到店90天 / 间隔60天」等写法
export function extractDaysSinceVisit(text?: string | null): number | null {
  if (!text) return null;
  const t = String(text);
  const patterns = [
    /(\d{1,4})\s*天\s*(?:未到店|没到店|没来|未到|未护理|没护理|中断|未复诊|失联|未回|没来店)/,
    /(?:中断|停了?|间隔|已有|距今|已经|超过|已|相隔)\s*(\d{1,4})\s*天/,
    /(?:未到店|没来|未护理|中断|未复诊|护理节奏中断)\s*(\d{1,4})\s*天/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n >= 0 && n <= 3650) return n;
    }
  }
  return null;
}

// 从文本里抽「第N天 / 前N天」跟进计划，返回升序去重的天数数组（如 "第3天确认、第7天复查" → [3,7]）
export function extractFollowupDays(text?: string | null): number[] {
  if (!text) return [];
  const days = new Set<number>();
  const re = /[第前]\s*(\d{1,3})\s*天/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(text))) !== null) {
    const n = parseInt(m[1], 10);
    if (n > 0 && n < 365) days.add(n);
  }
  return Array.from(days).sort((a, b) => a - b);
}

// 基于「成交/起算日」+ 第N天，算出下次跟进的绝对时间（取最近的一个未来计划点）
export function nextFollowFromPlan(baseIso: string | null, days: number[]): string | null {
  if (!days.length) return null;
  const base = baseIso ? new Date(baseIso).getTime() : Date.now();
  const now = Date.now();
  // 取「base + 第N天」里第一个还没到的；都过了就取最后一个（仍需跟进）
  const points = days.map((d) => base + d * 86400000).sort((a, b) => a - b);
  const future = points.find((p) => p >= now);
  const target = future ?? points[points.length - 1];
  return new Date(target).toISOString();
}

export const IMPORT_INSIGHT_VERSION = "2026-06-21.2";

export interface ImportInsight {
  version: string;
  segment: string;
  confidence: number;
  source: "raw_focus" | "derived_rules" | "low_context";
  evidence: string[];
  tags: string[];
  aiJudge: string;
  nextAction: string;
  script: string;
  riskNote?: string;
  followupDays: number[];
  needsReview: boolean;
  reviewReasons: string[];
  dataCompleteness: number;
}

interface ImportInsightInput {
  name?: string | null;
  phone?: string | null;
  notes?: string | null;
  project?: string | null;
  amount?: string | null;
  rawFocus?: string | null;
  lastVisitDays?: number | null;
  isDeal?: boolean;
}

function compact(s?: string | null, max = 80): string {
  return String(s || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

function has(text: string, re: RegExp): boolean {
  return re.test(text);
}

function evidenceFrom(notes: string, project: string, rawFocus: string): string[] {
  return [
    notes ? `情况说明：${compact(notes, 54)}` : "",
    project ? `成交项目：${compact(project, 36)}` : "",
    rawFocus ? `跟进重点：${compact(rawFocus, 44)}` : "",
  ].filter(Boolean).slice(0, 3);
}

function reviewReasonsFrom(input: {
  notes: string;
  project: string;
  rawFocus: string;
  lastVisitDays?: number | null;
  hasName: boolean;
  hasPhone: boolean;
}): string[] {
  const reasons: string[] = [];
  if (!input.hasName) reasons.push("缺客户姓名");
  if (!input.hasPhone) reasons.push("缺联系方式");
  if (!input.notes && !input.rawFocus) reasons.push("缺客户情况/跟进记录");
  if (!input.project) reasons.push("缺消费项目/护理项目");
  if (input.lastVisitDays == null && !input.rawFocus) reasons.push("缺最近到店或下一步计划");
  return reasons;
}

function dataCompleteness(input: {
  notes: string;
  project: string;
  rawFocus: string;
  amount: string;
  lastVisitDays?: number | null;
  hasName: boolean;
  hasPhone: boolean;
}): number {
  const weights = [
    input.hasName ? 15 : 0,
    input.hasPhone ? 15 : 0,
    input.notes ? 25 : 0,
    input.project ? 15 : 0,
    input.rawFocus ? 20 : 0,
    input.amount ? 5 : 0,
    input.lastVisitDays != null ? 5 : 0,
  ];
  return weights.reduce((sum, n) => sum + n, 0);
}

function signalSummary(text: string, project: string, amount: string): string {
  const signals: string[] = [];
  const rules: [RegExp, string][] = [
    [/敏感|泛红|刺痛|屏障|不适|怕刺激/, "敏感耐受"],
    [/闭口|粉刺|黑头|毛孔堵塞/, "闭口粉刺"],
    [/油脂|出油|油痘|控油/, "出油油痘"],
    [/痘印|暗沉|肤色|匀亮|上镜/, "痘印暗沉"],
    [/下巴|生理期/, "下巴反复"],
    [/(预算|消费|价格).{0,4}(谨慎|有限|敏感)|谨慎.{0,4}(预算|消费|价格)|价格敏感|高价(?!值)|基础维护/, "预算谨慎"],
    [/高意向|阶段管理|周期方案|进阶管理|中高客单/, "周期管理"],
    [/高价值|年度|专属|累计消费|复购稳定/, "高价值维护"],
    [/未到店|没到店|没来|沉睡|唤醒|中断|好久/, "久未到店"],
    [/红肿|熬夜|舒缓/, "红肿舒缓"],
  ];
  for (const [re, label] of rules) {
    if (re.test(text)) signals.push(label);
  }
  if (project) signals.push(`项目：${compact(project, 18)}`);
  if (amount && /\d/.test(amount)) signals.push(`消费：${compact(amount, 12)}`);
  return uniq(signals).slice(0, 3).join("、");
}

function scriptFor(kind: string, name: string, project: string): string {
  const n = name || "姐";
  if (kind === "dormant") {
    return `${n}，最近皮肤状态还好吗？我看到您之前有护理记录，先不急着推荐卡，方便的话这两天回来复查一下，我帮您看下现在适合怎么护理。`;
  }
  if (kind === "sensitive") {
    return `${n}，这次我先帮您确认皮肤耐受和舒适度，今天以稳妥修护为主，有任何不舒服您直接告诉我，我们不勉强做刺激项目。`;
  }
  if (kind === "highIntent") {
    return `${n}，您这个情况不建议只看单次效果，我先帮您把护理顺序和观察周期理清楚，咱们一步一步看反馈，再决定后面怎么做。`;
  }
  if (kind === "vip") {
    return `${n}，您之前一直比较稳定，我这边先帮您预留一个适合的护理时间，还是按您熟悉的节奏来，重点把状态维护住。`;
  }
  if (kind === "comedone") {
    return `${n}，闭口这类问题更适合按周期观察，我先帮您看一下集中区域和耐受情况，这次重点做清洁和复查安排。`;
  }
  if (kind === "oil") {
    return `${n}，最近出油情况我先帮您记录一下，护理后也别过度清洁，我们按清爽控油的节奏先看一周反馈。`;
  }
  if (kind === "marks") {
    return `${n}，痘印和暗沉需要按周期看变化，我先帮您记录现在的状态，护理后注意防晒和居家修护，我们下次再对比。`;
  }
  if (kind === "budget") {
    return `${n}，这次我不先给您推高价项目，先把基础护理体验做好，看您皮肤反馈和预算节奏，再慢慢安排。`;
  }
  if (kind === "redness") {
    return `${n}，我先确认一下红肿和熬夜后的状态，今天以舒缓稳定为主，如果有明显不适我们先记录并升级确认。`;
  }
  return `${n}，我先帮您看下这次${project || "护理"}后的反馈，再确认下一次护理时间，咱们按皮肤状态稳一点推进。`;
}

// 结构化导入洞察：把原始表格行转为「判断依据 + 行动 + 话术 + 置信度」。
// 不臆造事实，只根据原始列和明确关键词输出；低信息行会标记 needsReview。
export function buildImportInsight(input: ImportInsightInput): ImportInsight | null {
  const name = compact(input.name, 12) || "姐";
  const phone = compact(input.phone, 32);
  const notes = compact(input.notes, 220);
  const project = compact(input.project, 80);
  const amount = compact(input.amount, 24);
  const rawFocus = compact(input.rawFocus, 120);
  const text = `${notes} ${project} ${rawFocus}`.trim();
  const days = input.lastVisitDays ?? extractDaysSinceVisit(text);
  const hasName = !!compact(input.name, 40);
  const hasPhone = !!phone;
  const reviewReasons = reviewReasonsFrom({ notes, project, rawFocus, lastVisitDays: days, hasName, hasPhone });
  const completeness = dataCompleteness({ notes, project, rawFocus, amount, lastVisitDays: days, hasName, hasPhone });
  if (!text) {
    return {
      version: IMPORT_INSIGHT_VERSION,
      segment: "资料待补充客户",
      confidence: 0.35,
      source: "low_context",
      evidence: [],
      tags: ["资料待补充"],
      aiJudge: "原始名单只有基础信息，暂不能可靠判断需求、阶段和跟进重点；先补客户情况、最近到店、消费项目或真实顾虑。",
      nextAction: "3天内补齐客户来源、最近到店/咨询内容、已购项目和下一步目标，再让系统重新识别。",
      script: `${name}，我这边先把您的基础信息补完整，方便后面给您安排更合适的跟进和护理建议。`,
      riskNote: "资料不足时不要按系统建议直接推项目，应先补记录。",
      followupDays: [3],
      needsReview: true,
      reviewReasons,
      dataCompleteness: completeness,
    };
  }

  const tags: string[] = [];
  const evidence = evidenceFrom(notes, project, rawFocus);
  const signals = signalSummary(text, project, amount);
  const projectTarget = project ? `「${project}」` : "当前护理";
  const target = project ? `围绕${projectTarget}` : "围绕当前护理";
  const planDays = extractFollowupDays(rawFocus || text);
  let kind = "general";
  let segment = input.isDeal ? "成交老客维护" : "普通客户跟进";
  let aiJudge = rawFocus || "";
  let nextAction = "";
  let riskNote = "";
  let confidence = rawFocus ? 0.92 : 0.64;
  let followupDays = planDays;

  const dormant = has(text, /未到店|没到店|没来|沉睡|唤醒|中断|好久/) || (typeof days === "number" && days >= 45);
  const sensitive = has(text, /敏感|泛红|刺痛|屏障|防备|安全感|怕疼|怕刺激|担心|不适/);
  const highIntent = has(text, /高意向|多次咨询|愿意|阶段管理|周期方案|进阶管理|中高客单/);
  const vip = has(text, /高价值|年度|专属|累计消费|复购稳定/);
  const chin = has(notes, /下巴|生理期/);
  const comedone = has(text, /闭口|粉刺|净肤|毛孔堵塞|黑头/);
  const oil = has(text, /油脂|出油|油痘|控油/);
  const marks = has(text, /痘印|暗沉|肤色|上镜|匀亮/);
  const redness = has(text, /红肿|熬夜|舒缓/);
  const budget = has(text, /(预算|消费|价格).{0,4}(谨慎|有限|敏感)|谨慎.{0,4}(预算|消费|价格)|价格敏感|高价(?!值)|基础维护/);

  if (dormant) {
    kind = "dormant";
    segment = days && days >= 60 ? "沉睡待唤醒老客" : "回访风险老客";
    tags.push("沉睡", "低压力");
    aiJudge ||= `${days ? `${days}天未到店，` : ""}${signals || "老客回访"}信号明显；先恢复联系和信任，再给回店复查/基础护理理由。`;
    nextAction = `2天内发轻关怀，确认近期皮肤状态，${target}邀约一次复查或基础护理，不直接催单。`;
    followupDays = followupDays.length ? followupDays : [2];
    confidence += 0.16;
  } else if (sensitive) {
    kind = "sensitive";
    segment = "敏感高顾虑老客";
    tags.push("敏感", "安全感");
    aiJudge ||= `客户有${signals || "敏感/泛红/刺痛或防备"}信号，先确认耐受和舒适度，不急着推荐新项目。`;
    nextAction = `1天内做舒适度回访，记录不适史和耐受情况，再判断${projectTarget}是否继续推进。`;
    riskNote = "避免承诺效果或做医疗判断，出现明显异常需升级处理。";
    followupDays = followupDays.length ? followupDays : [1];
    confidence += 0.14;
  } else if (highIntent) {
    kind = "highIntent";
    segment = "高意向周期管理客户";
    tags.push("高意向", "周期管理");
    aiJudge ||= `客户有${signals || "阶段管理/周期方案"}信号，已具备周期管理机会；重点不是单次推销，而是明确护理顺序、预期和观察节奏。`;
    nextAction = `3天内沟通${target}的阶段方案，说明先做什么、观察什么、下次复查什么，降低急于见效预期。`;
    followupDays = followupDays.length ? followupDays : [3];
    confidence += 0.15;
  } else if (chin) {
    kind = "chin";
    segment = "下巴反复观察客户";
    tags.push("下巴反复", "小周期");
    aiJudge ||= `客户有${signals || "下巴反复/生理期前后波动"}信号，适合做小周期观察，不做内分泌诊断。`;
    nextAction = `3天内记录爆痘时间点和${target}后的反应，下次复查只围绕护理节奏和习惯建议。`;
    riskNote = "不做内分泌诊断，只从护理节奏、清洁和生活习惯角度建议。";
    followupDays = followupDays.length ? followupDays : [3];
    confidence += 0.12;
  } else if (vip) {
    kind = "vip";
    segment = "高价值老客维护";
    tags.push("高价值", "专属维护");
    aiJudge ||= `客户有${signals || "高价值/稳定复购"}信号，重点维护专属感和预约节奏，再自然带出长期维护方案。`;
    nextAction = `7天内做一次专属关怀并提前约${projectTarget}的下次护理时间，避免让客户感觉只在被推销。`;
    followupDays = followupDays.length ? followupDays : [7];
    confidence += 0.13;
  } else if (comedone) {
    kind = "comedone";
    segment = "闭口粉刺复查客户";
    tags.push("闭口粉刺", "复查");
    aiJudge ||= `客户关注${signals || "闭口/粉刺/净肤"}，适合按区域反应和小周期复查推进，不承诺单次解决。`;
    nextAction = `3天内确认闭口区域反应，提醒不要过度清洁，并预约${target}的小周期复查。`;
    followupDays = followupDays.length ? followupDays : [3];
    confidence += 0.1;
  } else if (oil) {
    kind = "oil";
    segment = "油痘控油维护客户";
    tags.push("油脂", "控油");
    aiJudge ||= `客户有${signals || "出油/油痘"}信号，先观察出油与闭口变化，重点提醒护理后不要过度清洁。`;
    nextAction = `3天内回访出油变化和清洁习惯，再预约${target}的清爽控油护理或复查。`;
    followupDays = followupDays.length ? followupDays : [3];
    confidence += 0.1;
  } else if (marks) {
    kind = "marks";
    segment = "痘印暗沉周期改善客户";
    tags.push("痘印", "防晒");
    aiJudge ||= `客户关注${signals || "痘印/暗沉/肤色"}，适合强调防晒和周期改善，不能承诺一次淡印。`;
    nextAction = `7天内记录痘印和肤色状态，提醒防晒与居家修护，下次${target}时做对比。`;
    riskNote = "避免承诺一次见效、明显淡化等绝对化效果。";
    followupDays = followupDays.length ? followupDays : [7];
    confidence += 0.1;
  } else if (redness) {
    kind = "redness";
    segment = "红肿舒缓观察客户";
    tags.push("红肿", "舒缓");
    aiJudge ||= `客户有${signals || "红肿/熬夜/舒缓"}信号，先确认红肿变化和作息影响，必要时做舒缓稳定护理。`;
    nextAction = `1天内确认红肿是否缓解，结合${target}记录反应，有不适及时升级确认。`;
    riskNote = "红肿异常不要自行判断为正常反应。";
    followupDays = followupDays.length ? followupDays : [1];
    confidence += 0.1;
  } else if (budget) {
    kind = "budget";
    segment = "预算谨慎维护客户";
    tags.push("预算谨慎", "基础维护");
    aiJudge ||= `客户有${signals || "预算谨慎"}信号，先维护服务体验和信任，不推高价卡，再逐步建立复购节奏。`;
    nextAction = `7天内做服务体验回访，优先推荐${target}里的低压力基础维护，不做高客单强推。`;
    followupDays = followupDays.length ? followupDays : [7];
    confidence += 0.09;
  } else if (/老客|复购|护理|项目|服务/.test(text)) {
    kind = "general";
    segment = "老客服务回访";
    tags.push("老客", "服务回访");
    aiJudge ||= `围绕${project || "已购项目"}做服务效果回访，确认皮肤变化并预约下次护理。`;
    nextAction = "7天内完成一次服务效果回访，确认满意度、皮肤反馈和下次护理时间。";
    followupDays = followupDays.length ? followupDays : [7];
    confidence += 0.05;
  }

  if (rawFocus) {
    tags.push("原表重点");
    if (!nextAction) nextAction = "按表格跟进重点执行，并补充跟进时间、客户反馈和下次预约。";
  }

  confidence = Math.max(0.35, Math.min(0.96, Number(confidence.toFixed(2))));
  const needsReview = confidence < 0.7 || evidence.length === 0 || completeness < 55;
  return {
    version: IMPORT_INSIGHT_VERSION,
    segment,
    confidence,
    source: rawFocus ? "raw_focus" : needsReview ? "low_context" : "derived_rules",
    evidence,
    tags: uniq(tags).slice(0, 6),
    aiJudge,
    nextAction: nextAction || "补充客户近况、到店时间和真实顾虑后再生成具体跟进动作。",
    script: scriptFor(kind, name, project),
    riskNote: riskNote || undefined,
    followupDays: followupDays.slice(0, 3),
    needsReview,
    reviewReasons,
    dataCompleteness: completeness,
  };
}

// 没有独立「下一步跟进重点」列时，从「情况说明 + 项目」派生一个可执行跟进重点。
// 这是导入体验的兜底：保留原始行，同时把门店表格里已经写明的客户信号转成机会卡可读的行动建议。
export function deriveFollowupFocus(notes?: string | null, project?: string | null): string | null {
  return buildImportInsight({ notes, project })?.aiJudge || null;
}
