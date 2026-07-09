// ============================================================
// Agent 行动执行器：把解析出的 AgentAction 落地为系统真实操作
// 权限原则：AI 执行的操作不能超过当前用户的权限范围
// ============================================================

import { db } from "../db";
import { isAdminRole } from "../constants";
import type { AuthContext } from "../types";
import type { AgentAction, AgentActionType } from "./actions";
import { AGENT_ACTION_LABELS } from "./actions";

export interface ExecutionResult {
  actionType: AgentActionType;
  label: string;
  success: boolean;
  detail: string;
  entityId?: string;
}

/**
 * 执行一组 Agent 行动
 * 每个行动独立执行，部分失败不影响其他行动
 */
export async function executeAgentActions(
  ctx: AuthContext,
  actions: AgentAction[],
  customerId?: string
): Promise<ExecutionResult[]> {
  if (actions.length === 0) return [];

  const results: ExecutionResult[] = [];
  const isAdmin = isAdminRole(ctx.baseRole);
  const isSelfOnly = !isAdmin; // 普通员工只能操作"自己"相关的

  for (const action of actions) {
    // 权限检查：非管理员不能给他人分配任务、不能修改客户核心信息
    if (isSelfOnly) {
      if (action.type === "update_customer_stage" || action.type === "add_customer_tag") {
        results.push({
          actionType: action.type,
          label: AGENT_ACTION_LABELS[action.type],
          success: false,
          detail: "仅店长/老板可修改客户信息",
        });
        continue;
      }
      if (action.type === "create_task" && action.payload.assignee && action.payload.assignee !== "self") {
        results.push({
          actionType: "create_task",
          label: AGENT_ACTION_LABELS.create_task,
          success: false,
          detail: "仅店长/老板可分配任务给他人",
        });
        continue;
      }
    }
    try {
      const result = await executeSingleAction(ctx, action, customerId);
      results.push(result);
    } catch (err) {
      results.push({
        actionType: action.type,
        label: AGENT_ACTION_LABELS[action.type],
        success: false,
        detail: `执行失败：${err instanceof Error ? err.message : "未知错误"}`,
      });
    }
  }

  return results;
}

async function executeSingleAction(
  ctx: AuthContext,
  action: AgentAction,
  customerId?: string
): Promise<ExecutionResult> {
  const storeId = ctx.store.id;
  const employeeId = ctx.employee.id;

  switch (action.type) {
    case "create_task":
      return executeCreateTask(storeId, employeeId, action);

    case "update_customer_stage":
      return executeUpdateStage(storeId, customerId, action);

    case "add_customer_tag":
      return executeAddTag(storeId, customerId, action);

    case "suggest_followup":
      return executeSuggestFollowup(storeId, customerId, action);

    case "trigger_opportunity":
      return executeTriggerOpportunity(storeId, employeeId, customerId, action);

    case "alert_manager":
      return executeAlertManager(ctx, action);

    default:
      return {
        actionType: action.type,
        label: AGENT_ACTION_LABELS[action.type] || action.type,
        success: false,
        detail: `不支持的行动类型：${action.type}`,
      };
  }
}

/** 创建任务 */
async function executeCreateTask(
  storeId: string,
  employeeId: string,
  action: AgentAction
): Promise<ExecutionResult> {
  const title = action.payload.title || "";
  const taskType = action.payload.task_type || "客户跟进";
  const deadline = action.payload.deadline || "";
  const assignee = action.payload.assignee || "self";

  if (!title) {
    return {
      actionType: "create_task",
      label: AGENT_ACTION_LABELS.create_task,
      success: false,
      detail: "缺少任务标题",
    };
  }

  const targetAssignee = assignee === "self" ? employeeId : (action.payload.assignedToId || employeeId);
  const task = await db.tasks.create({
    store_id: storeId,
    title,
    content: action.reason,
    task_type: taskType,
    assigned_to: targetAssignee,
    deadline: deadline || null,
    status: "todo",
    created_by: employeeId,
  });

  return {
    actionType: "create_task",
    label: AGENT_ACTION_LABELS.create_task,
    success: true,
    detail: `已创建任务"${title}"（${taskType}）${deadline ? `，截止 ${deadline}` : ""}`,
    entityId: task.id,
  };
}

/** 更新客户阶段 */
async function executeUpdateStage(
  storeId: string,
  customerId?: string,
  action?: AgentAction
): Promise<ExecutionResult> {
  if (!customerId) {
    return {
      actionType: "update_customer_stage",
      label: AGENT_ACTION_LABELS.update_customer_stage,
      success: false,
      detail: "未关联客户，无法更新阶段",
    };
  }

  const stage = action?.payload?.stage || "";
  const validStages = ["new", "intent", "deal", "regular", "churn_risk"];
  if (!validStages.includes(stage)) {
    return {
      actionType: "update_customer_stage",
      label: AGENT_ACTION_LABELS.update_customer_stage,
      success: false,
      detail: `无效的阶段值：${stage}（有效值：${validStages.join("/")}）`,
    };
  }

  await db.customers.update(customerId, storeId, {
    stage,
    notes: action?.payload?.reason_short
      ? `【AI建议更新】${action.payload.reason_short}`
      : "【AI建议更新阶段】",
  });

  return {
    actionType: "update_customer_stage",
    label: AGENT_ACTION_LABELS.update_customer_stage,
    success: true,
    detail: `已建议更新客户阶段为：${stage}（待人工确认）`,
  };
}

/** 添加客户标签 */
async function executeAddTag(
  storeId: string,
  customerId?: string,
  action?: AgentAction
): Promise<ExecutionResult> {
  if (!customerId) {
    return {
      actionType: "add_customer_tag",
      label: AGENT_ACTION_LABELS.add_customer_tag,
      success: false,
      detail: "未关联客户，无法添加标签",
    };
  }

  const tag = action?.payload?.tag || "";
  if (!tag) {
    return {
      actionType: "add_customer_tag",
      label: AGENT_ACTION_LABELS.add_customer_tag,
      success: false,
      detail: "缺少标签名",
    };
  }

  const cust: any = await db.customers.getById(customerId, storeId);
  const existingTags: string[] = Array.isArray(cust?.tags) ? cust.tags : [];
  if (!existingTags.includes(tag)) {
    await db.customers.update(customerId, storeId, {
      tags: [...existingTags, tag],
    });
  }

  return {
    actionType: "add_customer_tag",
    label: AGENT_ACTION_LABELS.add_customer_tag,
    success: true,
    detail: `已添加标签"${tag}"`,
  };
}

/** 建议跟进 */
async function executeSuggestFollowup(
  storeId: string,
  customerId?: string,
  action?: AgentAction
): Promise<ExecutionResult> {
  if (!customerId) {
    return {
      actionType: "suggest_followup",
      label: AGENT_ACTION_LABELS.suggest_followup,
      success: false,
      detail: "未关联客户，无法创建跟进建议",
    };
  }

  const method = action?.payload?.method || "微信";
  const date = action?.payload?.date || "";
  const note = action?.payload?.note || action?.reason || "";

  // 写入客户互动时间线作为跟进建议
  await db.interactions.create({
    store_id: storeId,
    customer_id: customerId,
    employee_id: null, // 系统建议
    kind: "followup_suggestion",
    channel: "ai",
    title: `建议${date ? `${date}` : "尽快"}通过${method}跟进`,
    summary: note,
  });

  // 同时也创建一条任务
  if (note) {
    await db.tasks.create({
      store_id: storeId,
      title: `跟进${note.slice(0, 20)}`,
      content: note,
      task_type: "客户跟进",
      assigned_to: null,
      deadline: date || null,
      status: "todo",
      created_by: null,
    });
  }

  return {
    actionType: "suggest_followup",
    label: AGENT_ACTION_LABELS.suggest_followup,
    success: true,
    detail: `已创建跟进建议${date ? `，建议 ${date}` : ""}通过${method}跟进`,
  };
}

/** 触发增长机会 */
async function executeTriggerOpportunity(
  storeId: string,
  employeeId: string,
  customerId?: string,
  action?: AgentAction
): Promise<ExecutionResult> {
  if (!customerId) {
    return {
      actionType: "trigger_opportunity",
      label: AGENT_ACTION_LABELS.trigger_opportunity,
      success: false,
      detail: "未关联客户，无法创建增长机会",
    };
  }

  const type = action?.payload?.opportunity_type || "";
  if (!type) {
    return {
      actionType: "trigger_opportunity",
      label: AGENT_ACTION_LABELS.trigger_opportunity,
      success: false,
      detail: "缺少机会类型",
    };
  }

  const opp = await db.opportunities.create({
    store_id: storeId,
    customer_id: customerId,
    employee_id: employeeId,
    type,
    status: "open",
    source: "ai_agent",
    note: action?.reason || "",
  });

  return {
    actionType: "trigger_opportunity",
    label: AGENT_ACTION_LABELS.trigger_opportunity,
    success: true,
    detail: `已创建增长机会（${type}）`,
    entityId: opp.id,
  };
}

/** 升级给管理者 */
async function executeAlertManager(
  ctx: AuthContext,
  action: AgentAction
): Promise<ExecutionResult> {
  // 创建一条待确认问题，标记为需要升级
  const reason = action.reason || "AI建议升级";
  await db.pending.create({
    store_id: ctx.store.id,
    employee_id: ctx.employee.id,
    question: `【Agent升级】${action.payload?.reason || reason}`,
    ai_suggestion: action.payload?.detail || "",
    category: "其他问题",
    risk_level: "L3",
    status: "pending",
  });

  return {
    actionType: "alert_manager",
    label: AGENT_ACTION_LABELS.alert_manager,
    success: true,
    detail: "已升级给管理者，请在待确认问题中查看",
  };
}
