// ============================================================
// AI 教练：首屏场景化 Copilot。点击场景后，向 AI 发送"带固定输出结构"的
// prompt，让回答稳定落在九个部分，并显式引用门店知识库来源。
// ============================================================

export interface CoachScene {
  code: string;
  label: string;
  hint: string;
}

export const COACH_SCENES: CoachScene[] = [
  { code: "price", label: "客户嫌贵", hint: "价格异议，价值锚定不轻易降价" },
  { code: "think", label: "考虑一下", hint: "模糊拒绝，挖出真实顾虑" },
  { code: "noreply", label: "不回微信", hint: "跟进节奏与重启话术" },
  { code: "effect", label: "问效果", hint: "效果承诺边界 + 禁用表达" },
  { code: "compare", label: "对比别家", hint: "差异化价值，不贬低同行" },
  { code: "wakeup", label: "老客唤醒", hint: "低压力召回，不催单" },
  { code: "postservice", label: "服务后回访", hint: "体验确认 + 复购铺垫" },
  { code: "complaint", label: "客户投诉", hint: "先安抚情绪再补救" },
  { code: "campaign", label: "活动介绍", hint: "结合当前主推活动邀约" },
  { code: "project", label: "项目讲解", hint: "卖点 + 适应人群 + 安全性" },
];

// AI 回答的固定结构（页面会展示，让员工知道会得到什么）
export const COACH_OUTPUT_SECTIONS = [
  "客户判断",
  "沟通策略",
  "建议话术",
  "追问问题",
  "下一步动作",
  "风险提醒",
  "是否需要升级",
  "是否补充客户标签",
  "参考知识来源",
];

// 知识来源示例（让"参考知识来源"可见、可信）
export const COACH_KNOWLEDGE_HINTS = ["本月活动方案", "补水护理 SOP", "价格异议话术", "禁用表达规则"];

export function buildCoachPrompt(scene: CoachScene): string {
  return [
    `场景：${scene.label}（${scene.hint}）。`,
    `你是门店成交/服务教练，请严格按以下九个部分输出，每部分简短、可直接执行：`,
    `1. 客户判断`,
    `2. 沟通策略`,
    `3. 建议话术（可直接发给客户）`,
    `4. 追问问题`,
    `5. 下一步动作`,
    `6. 风险提醒`,
    `7. 是否需要升级（是否需要店长/老板介入）`,
    `8. 是否补充客户标签`,
    `9. 参考知识来源（明确引用门店知识库，如本月活动方案 / 护理SOP / 价格异议话术 / 禁用表达规则）`,
  ].join("\n");
}
