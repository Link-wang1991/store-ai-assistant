// ============================================================
// 多模态能力（图片 / 语音 / 视频）
// 图片：配置 Qwen 时调用 Vision，否则返回占位说明（入口已就绪）。
// 语音/视频：仅预留接口，暂不实现。
// 合规红线：涉及客户皮肤/术后/红肿/过敏等，只辅助整理，不做医疗诊断，建议升级。
// ============================================================

import { callQwenVision, qwenConfigured } from "./qwen";
import { roleLabel } from "../roles";

// 真正的皮肤/健康异常词（不含"反馈""脸"等场景词，避免误判普通反馈图）
const SKIN_RISK_HINTS = ["皮肤", "红肿", "泛红", "过敏", "术后", "不适", "敏感", "灼伤", "破皮", "发炎", "化脓", "水泡"];

const SAFETY_NOTE =
  "⚠️ 注意：涉及客户皮肤、术后、红肿、过敏等图片，我只能帮你辅助整理情况，不能做任何医疗诊断或疗效判断，请立即升级给店长或专业负责人处理。";

export const IMAGE_SCENES = [
  { key: "chat", label: "客户聊天截图" },
  { key: "poster", label: "活动海报文案" },
  { key: "review", label: "美团/点评截图" },
  { key: "feedback", label: "客户反馈图片" },
];

function buildVisionPrompt(role: string, hint?: string): string {
  const h = hint || "";
  const who = roleLabel(role);
  const base = `你是门店 AI 助手，正在帮【${who}】看一张图片（场景：${h || "未指定"}）。只做客观整理，不要编造，绝不做医疗诊断或承诺疗效。`;

  if (h.includes("海报") || h.includes("活动")) {
    return `${base}
请输出：
1) 活动规则摘要（主推项目、价格、适用人群、时间、是否可叠加等关键规则）
2) 员工对客户讲解时要强调和要规避的点
3) 是否建议把该活动补充进门店知识库（是/否，并说明原因）。`;
  }
  if (h.includes("聊天")) {
    return `${base}
请输出：
1) 客户意图（客户想要什么、顾虑是什么）
2) 风险点（是否涉及价格承诺、退款、效果承诺、皮肤异常等需谨慎或升级的内容）
3) 建议回复话术（可直接发给客户，避免绝对化表达和疗效承诺）。`;
  }
  if (h.includes("点评") || h.includes("美团")) {
    return `${base}
请输出：
1) 页面/评价的关键信息（评分、好评差评要点、客户关注点）
2) 对${who}的运营或回复建议
3) 是否存在需要升级处理的差评或投诉风险。`;
  }
  if (h.includes("反馈")) {
    return `${base}
请输出：
1) 客观描述图片中客户反馈的情况（不下医疗结论）
2) ${who}下一步该怎么做
3) 若出现皮肤红肿/过敏/术后不适等异常迹象，必须明确提示：立即升级给店长或专业负责人，不得自行判断或处理。`;
  }
  return `${base}
请输出：1) 图片关键信息；2) 对${who}的下一步建议；3) 若涉及客户皮肤异常/术后/红肿/过敏，明确提示升级给专业负责人。`;
}

export interface ImageAnalysis {
  text: string;
  needsUpgrade: boolean;
}

export async function analyzeImage(opts: {
  imageUrl: string; // data URL 或公网 URL
  role: string;
  hint?: string;
}): Promise<ImageAnalysis> {
  const hintText = `${opts.hint || ""}`;
  const isSkin = SKIN_RISK_HINTS.some((k) => hintText.includes(k));

  // 配置了 Qwen 才真正识别
  if (qwenConfigured()) {
    try {
      // 让模型显式返回风险标记，避免「输出里出现"皮肤"二字就误判 L4」
      const riskInstruction =
        "\n\n【风险标记】回复最后必须单独输出一行：若图片中确实可见皮肤红肿/皮疹/破损/过敏/术后异常等真实皮肤健康问题，输出 RISK_FLAG: HIGH；否则输出 RISK_FLAG: NONE。";
      const raw = await callQwenVision({
        prompt: buildVisionPrompt(opts.role, opts.hint) + riskInstruction,
        imageUrl: opts.imageUrl,
        system: "你是严谨的门店助手，只整理图片信息，绝不做医疗诊断或疗效承诺。",
      });
      const flagHigh = /RISK_FLAG:\s*HIGH/i.test(raw);
      const text = raw.replace(/RISK_FLAG:\s*(HIGH|NONE)/gi, "").trim();
      // 升级条件：员工已在场景里标注皮肤问题(isSkin) 或 模型确认图中有皮肤异常(flagHigh)
      const needsUpgrade = isSkin || flagHigh;
      return { text: needsUpgrade ? `${text}\n\n${SAFETY_NOTE}` : text, needsUpgrade };
    } catch (e: any) {
      return { text: `图片识别失败：${e.message}`, needsUpgrade: isSkin };
    }
  }

  // 占位（入口已就绪，未接入识别）
  const placeholder = [
    "📷 已收到图片。当前未接入图片识别（需在 .env.local 配置 QWEN_API_KEY 并设 AI 走 Qwen Vision）。",
    "",
    "接入后可识别：客户聊天截图、活动海报文案、美团/点评截图、客户反馈图片（辅助整理，不做诊断）。",
  ].join("\n");
  return { text: isSkin ? `${placeholder}\n\n${SAFETY_NOTE}` : placeholder, needsUpgrade: isSkin };
}

// 预留：语音识别
export async function transcribeAudio(_opts: { audioUrl: string }): Promise<string> {
  throw new Error("语音识别暂未开放（已预留 Qwen Audio 接口）");
}

// 预留：视频理解
export async function analyzeVideo(_opts: { videoUrl: string }): Promise<string> {
  throw new Error("视频理解暂未开放");
}
