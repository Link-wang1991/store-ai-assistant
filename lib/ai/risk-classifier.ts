import type { QuestionCategory, RiskLevel } from "../constants";

// ============================================================
// 问题分类 + 风险等级判定（产品说明书第九章）
// 规则化关键词判断：稳定、可解释、零成本。风险判定宁可从严。
// ============================================================

// 始终高风险（已构成事故/法律/严重医疗，必须升级，不交 AI 处置）
const ALWAYS_L4 = [
  "投诉", "维权", "曝光", "起诉", "律师", "法律", "赔偿", "纠纷",
  "病历", "处方", "晕厥", "休克", "呼吸困难", "剧痛", "化脓", "溃烂", "烫伤", "灼伤",
];

// 症状/身体反应词：仅当"已经发生"才升级；若只是客户顾虑、咨询如何应对，
// 这是销售沟通问题（美容师就该解决），交 AI 用方法论正常解答 + 风险提醒。
const SYMPTOM_WORDS = [
  "过敏", "红肿", "泛红", "起泡", "水泡", "破皮", "发炎", "感染",
  "色沉", "色素沉着", "留疤", "疤痕", "术后", "不适", "心慌", "确诊", "诊断",
];

// "已经发生"语境信号 —— 出现这些才把症状词判为真实不良反应。
const OCCURRED_CTX = [
  "已经", "出现", "做完", "刚做", "术后第", "现在", "昨天做", "今天做",
  "红了", "肿了", "破了", "起泡了", "发炎了", "过敏了", "感染了", "留疤了", "反应",
];

// L3 需老板/店长确认：价格、活动叠加、退款、排班、承诺等
const L3_KEYWORDS = [
  "退款", "退钱", "退卡", "便宜", "优惠", "打折", "降价", "再送",
  "能不能少", "抹零", "活动叠加", "叠加", "一起用", "会员价",
  "排班", "调班", "请假",
  "承诺", "保证", "包", "免费送", "额外赠送",
];

const CATEGORY_RULES: [QuestionCategory, string[]][] = [
  ["医美健康异常", ["过敏", "红肿", "泛红", "灼伤", "感染", "术后", "不适", "皮肤异常", "发炎"]],
  ["客诉处理", ["投诉", "不满意", "差评", "维权", "退款", "纠纷"]],
  ["活动政策", ["活动", "优惠", "团购", "套餐", "促销", "叠加", "会员"]],
  ["销售话术", ["怎么回", "话术", "嫌贵", "考虑一下", "成交", "逼单", "不回微信", "对比别家", "异议"]],
  ["客户跟进", ["跟进", "回访", "唤醒", "老客", "复购", "邀约"]],
  ["护理流程", ["流程", "sop", "服务前", "服务后", "操作", "手法", "护理", "注意事项"]],
  ["项目介绍", ["项目", "介绍", "功效", "适合", "原理", "几次", "疗程"]],
  ["运营文案", ["朋友圈", "小红书", "文案", "标题", "海报", "种草", "笔记"]],
  ["合规表达", ["违规", "禁用词", "能不能说", "合规", "敏感词"]],
  ["员工管理", ["排班", "考核", "培训", "晨会", "提成", "绩效"]],
  ["经营数据", ["业绩", "营业额", "数据", "报表", "客流", "转化率"]],
];

export interface Classification {
  category: QuestionCategory;
  baseRisk: RiskLevel;
  matchedRiskKeywords: string[];
}

export function classifyQuestion(question: string): Classification {
  const q = question.toLowerCase();
  const always = ALWAYS_L4.filter((k) => q.includes(k.toLowerCase()));
  const symptom = SYMPTOM_WORDS.filter((k) => q.includes(k.toLowerCase()));
  const occurred = OCCURRED_CTX.some((k) => q.includes(k));
  const l3 = L3_KEYWORDS.filter((k) => q.includes(k.toLowerCase()));

  let baseRisk: RiskLevel = "L1";
  let matchedRiskKeywords: string[] = [];
  if (always.length > 0) {
    baseRisk = "L4";
    matchedRiskKeywords = always;
  } else if (symptom.length > 0 && occurred) {
    // 症状词 + 已发生语境 → 真实不良反应，升级；仅"怕/担心/会不会"这类顾虑则不升级，交 AI 解答
    baseRisk = "L4";
    matchedRiskKeywords = symptom;
  } else if (l3.length > 0) {
    baseRisk = "L3";
    matchedRiskKeywords = l3;
  }

  let category: QuestionCategory = "其他问题";
  for (const [cat, kws] of CATEGORY_RULES) {
    if (kws.some((k) => q.includes(k.toLowerCase()))) {
      category = cat;
      break;
    }
  }
  return { category, baseRisk, matchedRiskKeywords };
}

export function findBannedWords(text: string, bannedWords: string[]): string[] {
  if (!text) return [];
  return bannedWords.filter((w) => w && text.includes(w));
}
