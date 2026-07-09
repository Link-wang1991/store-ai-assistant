// ============================================================
// Agent 行动框架：AI 在回答中可以生成的"结构化行动建议"
// AI 输出 → 解析行动 → 系统执行（创建任务、更新画像、安排跟进等）
// ============================================================

/** 当前支持的 Agent 行动类型 */
export const AGENT_ACTION_TYPES = [
  "create_task",           // 创建跟进/执行任务
  "update_customer_stage", // 建议更新客户阶段
  "add_customer_tag",      // 建议添加客户标签
  "suggest_followup",      // 建议跟进时间和方式
  "trigger_opportunity",   // 建议创建增长机会
  "alert_manager",         // 建议升级给店长/老板
] as const;

export type AgentActionType = (typeof AGENT_ACTION_TYPES)[number];

export const AGENT_ACTION_LABELS: Record<AgentActionType, string> = {
  create_task: "创建任务",
  update_customer_stage: "更新客户阶段",
  add_customer_tag: "添加客户标签",
  suggest_followup: "建议跟进计划",
  trigger_opportunity: "创建增长机会",
  alert_manager: "升级给管理者",
};

export const AGENT_ACTION_DESCRIPTIONS: Record<AgentActionType, string> = {
  create_task: "创建一条任务，指定任务类型、标题、负责人和截止日期",
  update_customer_stage: "建议更新客户的档案阶段（新客/意向/已成交/老客/流失风险）",
  add_customer_tag: "建议给客户添加标签（如决策型/价格敏感/效果好再买等）",
  suggest_followup: "建议下次跟进的时间和方式（电话/微信/到店）",
  trigger_opportunity: "建议创建一条增长机会（服务补救/新客转化/老客唤醒等）",
  alert_manager: "建议将此客户升级给管理者处理",
};

/** 单条 Agent 行动 */
export interface AgentAction {
  type: AgentActionType;
  reason: string;       // 为什么要执行这个行动
  payload: Record<string, string>;
}

// ---------- 行动格式标记 ----------

export const ACTION_MARKER_START = "【AGENT_ACTION】";
export const ACTION_MARKER_END = "【/AGENT_ACTION】";

/**
 * 从 AI 回答文本中解析出所有 Agent 行动
 * 格式：
 * 【AGENT_ACTION】
 * {"type":"create_task","reason":"客户价格敏感，建议3天后跟进","payload":{"title":"跟进张女士","task_type":"客户跟进","deadline":"2026-07-12"}}
 * 【/AGENT_ACTION】
 */
export function parseAgentActions(text: string): AgentAction[] {
  const actions: AgentAction[] = [];
  const startMarker = ACTION_MARKER_START;
  const endMarker = ACTION_MARKER_END;

  let cursor = 0;
  while (cursor < text.length) {
    const startIdx = text.indexOf(startMarker, cursor);
    if (startIdx === -1) break;

    const endIdx = text.indexOf(endMarker, startIdx + startMarker.length);
    if (endIdx === -1) break;

    const jsonStr = text
      .slice(startIdx + startMarker.length, endIdx)
      .trim();

    try {
      const parsed = JSON.parse(jsonStr);
      if (isValidAgentAction(parsed)) {
        actions.push(parsed as AgentAction);
      }
    } catch {
      // JSON 解析失败，跳过
    }

    cursor = endIdx + endMarker.length;
  }

  return actions;
}

/** 从 AI 回答中移除 Agent 行动标记（前端不展示） */
export function stripAgentActions(text: string): string {
  const startMarker = ACTION_MARKER_START;
  const endMarker = ACTION_MARKER_END;
  return text.replace(new RegExp(`${startMarker}[\\s\\S]*?${endMarker}\\n?`, "g"), "").trim();
}

function isValidAgentAction(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const a = obj as Record<string, unknown>;
  return (
    typeof a.type === "string" &&
    AGENT_ACTION_TYPES.includes(a.type as AgentActionType) &&
    typeof a.payload === "object" &&
    a.payload !== null &&
    typeof a.reason === "string"
  );
}

// ---------- 构建 Agent 行动指令（注入 system prompt）----------

/** 告诉 AI 可以输出 Agent 行动的指令 */
export function buildAgentActionInstruction(
  hasCustomer: boolean,
  employeeId: string
): string {
  const lines: string[] = [
    `【Agent 行动能力】`,
    `你可以根据当前情况输出结构化行动建议，系统会自动执行。`,
    `如果你觉得需要执行以下操作，在你的回答最后另起一行，按 JSON 格式输出：`,
    ``,
    `${ACTION_MARKER_START}`,
    `{"type":"行动类型","reason":"为什么执行","payload":{具体参数}}`,
    `${ACTION_MARKER_END}`,
    ``,
    `支持的行动类型（每次最多输出 1-2 条，只有确实需要才输出，不要为了输出而输出）：`,
  ];

  for (const type of AGENT_ACTION_TYPES) {
    const desc = AGENT_ACTION_DESCRIPTIONS[type];
    lines.push(`- ${type}：${desc}`);
  }

  lines.push(``);
  lines.push(`行动类型参数说明：`);
  lines.push(`- create_task：payload 需要 title（任务标题）、task_type（任务类型，可选值：${["客户跟进","活动执行","员工培训","老客唤醒","朋友圈发布","客诉处理","服务复盘","知识库补充"].join("/")}）、deadline（截止日期 YYYY-MM-DD）、assignee（负责人，self 给自己、manager 给店长、或留空）`);
  lines.push(`- update_customer_stage：payload 需要 stage（new/intent/deal/regular/churn_risk）、reason_short（简短原因）`);
  lines.push(`- add_customer_tag：payload 需要 tag（标签名）`);
  if (!hasCustomer) {
    lines.push(``);
    lines.push(`⚠️ 当前对话没有关联具体客户，创建任务时请使用"跟进客户"等通用描述，不要编造客户姓名。`);
  }

  return lines.join("\n");
}
