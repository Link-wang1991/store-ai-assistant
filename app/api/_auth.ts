// ============================================================
// API Route Handler 共享鉴权工具
// 从 store_ai_token cookie 中获取当前用户信息
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/data-source";

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
export async function getAuthContext(req: NextRequest): Promise<AuthContext | null> {
  const token = req.cookies.get("store_ai_token")?.value;
  if (!token) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const result = await response.json();
    const payload = result?.data;
    if (!response.ok || result?.code !== 200 || !payload?.userId) return null;

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
export async function requireAuth(req: NextRequest): Promise<AuthContext | NextResponse> {
  const ctx = await getAuthContext(req);
  if (!ctx) {
    return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });
  }
  return ctx;
}
