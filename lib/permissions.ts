import type { AuthContext } from "./types";

// ============================================================
// 权限引擎：基于 ctx.permissions（角色权限矩阵）判断。
// 未配置权限时按 base_role 兜底（owner 全权、manager 近全权），
// 兼容尚未执行 seed 配权限的门店，避免直接锁死后台。
// ============================================================

export type PermModule =
  | "workbench" | "customers" | "followups" | "schedules" | "campaigns"
  | "projects" | "knowledge" | "risks" | "reports" | "employees" | "permissions";

export type PermAction =
  | "view" | "create" | "edit" | "delete" | "assign" | "review" | "export" | "handle_risk";

export function hasPermission(ctx: AuthContext, module: PermModule, action: PermAction): boolean {
  // 有该模块的明确配置：以配置为准（含"actions 被清空 = 无权限"）
  if (ctx.permissions && Object.prototype.hasOwnProperty.call(ctx.permissions, module)) {
    return (ctx.permissions[module].actions || []).includes(action);
  }
  // 无配置 → 按 base_role 兜底
  if (ctx.baseRole === "owner") return true;
  if (ctx.baseRole === "manager") return module === "permissions" ? action === "view" : true;
  if (action === "view" && ["workbench", "knowledge", "campaigns", "projects", "schedules"].includes(module)) {
    return true;
  }
  return false;
}

export function getDataScope(ctx: AuthContext, module: PermModule): string {
  const p = ctx.permissions?.[module];
  if (p?.data_scope) return p.data_scope;
  if (ctx.baseRole === "owner") return "all";
  if (ctx.baseRole === "manager") return "store";
  return "self";
}

// 用于 server action：无权限直接抛错
export function requirePermission(ctx: AuthContext, module: PermModule, action: PermAction): void {
  if (!hasPermission(ctx, module, action)) {
    throw new Error(`无权限：${module}.${action}`);
  }
}

// 是否能进入「今日增长作战室」/admin（老板视角的全店经营后台）。
// 规则收紧：只允许 owner / manager，或被【显式】授予 reports 或 customers 的全店(view)权限的角色。
// 关键：不走 base_role 兜底——普通员工（咨询师/美容师/前台）即使兜底有 knowledge/workbench view，
// 也不得进入 /admin，只能在 /work 看「我今天最该跟进」。
export function canEnterAdmin(ctx: AuthContext): boolean {
  if (ctx.baseRole === "owner" || ctx.baseRole === "manager") return true;
  for (const m of ["reports", "customers"] as const) {
    const p = ctx.permissions?.[m];
    if (
      p &&
      (p.actions || []).includes("view") &&
      (p.data_scope === "store" || p.data_scope === "all")
    ) {
      return true;
    }
  }
  return false;
}
