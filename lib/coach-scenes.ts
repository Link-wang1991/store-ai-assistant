// ============================================================
// AI 教练：首屏场景化 Copilot。点击场景后，向 AI 发送"带固定输出结构"的
// prompt，让回答稳定落在九个部分，并显式引用门店知识库来源。
// ============================================================

export interface CoachScene {
  code: string;
  label: string;
  hint: string;
  /** Agent 行为提示：告诉 AI 这个场景下应该主动做什么 */
  agentActions?: string[];
}

export const COACH_SCENES: CoachScene[] = [
  {
    code: "price",
    label: "客户嫌贵",
    hint: "价格异议，价值锚定不轻易降价",
    agentActions: ["建议给客户打标签「价格敏感」", "如果客户已离店，建议创建跟进任务"],
  },
  {
    code: "think",
    label: "考虑一下",
    hint: "模糊拒绝，挖出真实顾虑",
    agentActions: ["建议创建跟进任务（2-3天后）", "建议给客户打标签「犹豫型」"],
  },
  {
    code: "noreply",
    label: "不回微信",
    hint: "跟进节奏与重启话术",
    agentActions: ["建议创建跟进任务，注明最佳触达时间", "如果超3天未回复，建议升级给店长"],
  },
  {
    code: "effect",
    label: "问效果",
    hint: "效果承诺边界 + 禁用表达",
    agentActions: ["检查回答中是否含禁用承诺词", "建议给客户打标签「效果导向」"],
  },
  {
    code: "compare",
    label: "对比别家",
    hint: "差异化价值，不贬低同行",
    agentActions: ["建议给客户打标签「比价型」", "如果客户多次对比，建议创建跟进任务"],
  },
  {
    code: "wakeup",
    label: "老客唤醒",
    hint: "低压力召回，不催单",
    agentActions: ["建议创建增长机会「老客唤醒」", "建议结合本月活动邀约"],
  },
  {
    code: "postservice",
    label: "服务后回访",
    hint: "体验确认 + 复购铺垫",
    agentActions: ["建议创建跟进任务（3天后回访）", "如果客户满意，建议创建增长机会「服务回访→复购」"],
  },
  {
    code: "complaint",
    label: "客户投诉",
    hint: "先安抚情绪再补救",
    agentActions: ["如果投诉严重，建议升级给店长", "建议创建增长机会「服务补救」"],
  },
  {
    code: "campaign",
    label: "活动介绍",
    hint: "结合当前主推活动邀约",
    agentActions: ["建议给符合条件的客户批量邀约", "建议创建增长机会「活动邀约」"],
  },
  {
    code: "project",
    label: "项目讲解",
    hint: "卖点 + 适应人群 + 安全性",
    agentActions: ["建议给客户打标签「对XX项目感兴趣」", "如果客户有意向，建议更新客户阶段为「意向」"],
  },
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
  const actionHints =
    scene.agentActions && scene.agentActions.length > 0
      ? `\n\n【你的行动能力】根据情况，你可以选择输出以下行动（系统会自动执行，不需要员工手动操作）：\n${scene.agentActions.map((a) => `- ${a}`).join("\n")}\n\n按照本章开头要求的 Agent 格式输出行动。`
      : "";

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
    actionHints,
  ].join("\n");
}
