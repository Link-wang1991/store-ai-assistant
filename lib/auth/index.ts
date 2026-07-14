// ============================================================
// 登录上下文（lib/auth）
// ============================================================

import { db } from "../db";
import { getServerToken } from "../api-client";
import type { AuthContext } from "../types";

async function loadFullContext(authUserId: string): Promise<AuthContext | null> {
  const user = await db.users.getByAuthId(authUserId);
  if (!user) return null;

  const employee = await db.employees.getActiveByUserId(user.id);
  if (!employee) return null;

  const store = await db.stores.getById(employee.store_id);
  if (!store) return null;

  const roleLabels = await db.roles.labelMap(employee.store_id);

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
    authUserId: authUserId,
    user: user as AuthContext["user"],
    employee: employee as AuthContext["employee"],
    store: store as AuthContext["store"],
    roleLabels: roleLabels || {},
    baseRole,
    permissions,
  };
}

export async function getAuthContext(): Promise<AuthContext | null> {
  try {
    const token = await getServerToken();
    if (!token) return null;
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString(),
    );
    if (!payload.sub) return null;
    return loadFullContext(payload.sub);
  } catch {
    return null;
  }
}

// Supabase 模式残余 — 后端模式不会调用
export async function createAccount(_email?: string, _password?: string): Promise<{ authUserId: string }> {
  throw new Error("后端模式下不支持此操作");
}
export async function deleteAccount(_authUserId?: string): Promise<void> {
  throw new Error("后端模式下不支持此操作");
}
