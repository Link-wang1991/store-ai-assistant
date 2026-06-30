// ============================================================
// 登录上下文（lib/auth）。组合「认证 Provider」+「数据适配层 db」，
// 得到当前登录员工的完整上下文。页面/actions 统一从这里取 ctx。
// ============================================================

import { getSessionAuthUserId } from "./provider";
import { db } from "../db";
import type { AuthContext } from "../types";

export async function getAuthContext(): Promise<AuthContext | null> {
  const authUserId = await getSessionAuthUserId();
  if (!authUserId) return null;

  const user = await db.users.getByAuthId(authUserId);
  if (!user) return null;

  const employee = await db.employees.getActiveByUserId(user.id);
  if (!employee) return null; // 离职/停用员工无法进入

  const store = await db.stores.getById(employee.store_id);
  if (!store) return null;

  // 门店自定义角色名（未执行 V2 迁移/未配置时返回 {}，由 roleLabel 回退内置名）
  const roleLabels = await db.roles.labelMap(employee.store_id);

  // base_role（自定义角色继承内置模板）+ 权限矩阵
  const def = await db.roles.getDefinition(employee.store_id, employee.role);
  const baseRole = ((def as any)?.base_role as string) || employee.role;

  let permRows = await db.roles.permissionsForRole(employee.store_id, employee.role);
  if ((!permRows || permRows.length === 0) && baseRole !== employee.role) {
    permRows = await db.roles.permissionsForRole(employee.store_id, baseRole);
  }
  const permissions: Record<string, { actions: string[]; data_scope: string }> = {};
  for (const p of permRows as any[]) {
    permissions[p.module] = { actions: p.actions || [], data_scope: p.data_scope || "self" };
  }

  return {
    authUserId,
    user: user as AuthContext["user"],
    employee: employee as AuthContext["employee"],
    store: store as AuthContext["store"],
    roleLabels: roleLabels || {},
    baseRole,
    permissions,
  };
}

export { createAccount, deleteAccount } from "./provider";
