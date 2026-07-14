// ============================================================
// 服务端认证上下文（替代 getAuthContext，不再依赖 Supabase）
// 从 JWT cookie 中解析用户信息，不需要调用任何外部服务
// ============================================================

import { cookies } from "next/headers";

export interface ApiAuthContext {
  storeId: string;
  employeeId: string;
  role: string;
  userId: string;
}

/**
 * 从 cookie 中的 JWT 解析登录上下文。
 * 仅用于 Server Component 中判断登录态和角色路由，不做数据查询。
 */
export async function getApiAuth(): Promise<ApiAuthContext | null> {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get("store_ai_token")?.value;
    if (!token) return null;

    // JWT 格式: header.payload.signature
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());

    if (!payload.storeId || !payload.employeeId) return null;

    return {
      storeId: payload.storeId,
      employeeId: payload.employeeId,
      role: payload.role || "",
      userId: payload.sub || "",
    };
  } catch {
    return null;
  }
}

/** 判断是否为管理员角色 */
export function isAdminRole(role: string): boolean {
  return role === "owner" || role === "manager";
}
