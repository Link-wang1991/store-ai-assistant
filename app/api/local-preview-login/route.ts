import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/data-source";

export const runtime = "nodejs";

const PREVIEW_MAX_AGE_SECONDS = 4 * 60 * 60;

/**
 * 本机角色体验的 Next 代理：由后端决定是否允许，成功时才写入短时会话 cookie。
 * 不接收、保存或校验任何员工密码。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const response = await fetch(`${API_BASE_URL}/api/auth/local-preview-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: body?.employeeId }),
      cache: "no-store",
    });
    const json = await response.json();
    if (!response.ok || json.code !== 200 || !json.data?.token) {
      return NextResponse.json(json, { status: response.status || 401 });
    }
    const result = NextResponse.json(json);
    result.cookies.set("store_ai_token", json.data.token, {
      path: "/",
      maxAge: PREVIEW_MAX_AGE_SECONDS,
      sameSite: "lax",
    });
    return result;
  } catch {
    return NextResponse.json({ code: 500, message: "无法连接本机角色体验服务" }, { status: 500 });
  }
}
