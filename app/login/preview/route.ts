import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/data-source";

export const runtime = "nodejs";

const PREVIEW_MAX_AGE_SECONDS = 4 * 60 * 60;

function browserUrl(request: NextRequest, pathname: string) {
  // Next dev 以 0.0.0.0 监听时 request.url 可能携带 0.0.0.0；手机不能跳转到
  // 该地址，因此必须保留浏览器实际访问的 Host（例如 192.168.x.x:3000）。
  const url = new URL(pathname, request.url);
  const host = request.headers.get("host");
  if (host) url.host = host;
  return url;
}

/**
 * 移动端免密角色的原生跳转：不依赖 React hydration，后端仍负责确认
 * local profile、在职状态、门店范围与短时 JWT 签发。
 */
export async function GET(request: NextRequest) {
  const employeeId = request.nextUrl.searchParams.get("employeeId");
  const loginUrl = browserUrl(request, "/login");
  if (!employeeId) {
    loginUrl.searchParams.set("previewError", "missing-role");
    return NextResponse.redirect(loginUrl);
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/local-preview-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId }),
      cache: "no-store",
    });
    const json = await response.json();
    if (!response.ok || json.code !== 200 || !json.data?.token) {
      loginUrl.searchParams.set("previewError", "unavailable");
      return NextResponse.redirect(loginUrl);
    }

    const role = String(json.data.role || "");
    const destination = ["owner", "manager", "admin"].includes(role) ? "/admin" : "/home";
    const result = NextResponse.redirect(browserUrl(request, destination));
    result.cookies.set("store_ai_token", json.data.token, {
      path: "/",
      maxAge: PREVIEW_MAX_AGE_SECONDS,
      sameSite: "lax",
    });
    result.cookies.set("store_ai_local_preview", "1", {
      path: "/",
      maxAge: PREVIEW_MAX_AGE_SECONDS,
      sameSite: "lax",
    });
    return result;
  } catch {
    loginUrl.searchParams.set("previewError", "unavailable");
    return NextResponse.redirect(loginUrl);
  }
}
