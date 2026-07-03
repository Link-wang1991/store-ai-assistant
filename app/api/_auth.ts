// ============================================================
// API Route Handler 共享鉴权工具
// 从 store_ai_token cookie 中获取当前用户信息
// ============================================================

import { NextRequest, NextResponse } from "next/server";

export interface AuthContext {
  userId: string;
  employeeId: string;
  storeId: string;
  role: string;
  roleLabel: string;
  storeName: string;
  email?: string;
  name?: string;
}

/**
 * 从 store_ai_token cookie 提取用户上下文
 */
export function getAuthContext(req: NextRequest): AuthContext | null {
  const token = req.cookies.get("store_ai_token")?.value;
  if (!token) return null;

  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payloadStr = Buffer.from(parts[1], "base64url").toString("utf-8");
    const payload = JSON.parse(payloadStr);

    return {
      userId: payload.userId || "",
      employeeId: payload.employeeId || "",
      storeId: payload.storeId || "",
      role: payload.role || "",
      roleLabel: payload.roleLabel || "",
      storeName: payload.storeName || "",
      email: payload.email,
      name: payload.name,
    };
  } catch {
    return null;
  }
}

/**
 * 鉴权守卫：未登录返回 401
 */
export function requireAuth(req: NextRequest): AuthContext | NextResponse {
  const ctx = getAuthContext(req);
  if (!ctx) {
    return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });
  }
  return ctx;
}
