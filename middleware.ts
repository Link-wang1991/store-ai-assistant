import { NextResponse, type NextRequest } from "next/server";

// ============================================================
// 中间件：路由鉴权（兼容 Supabase + Spring Boot 双模式）
//
// 检查顺序：
//   1. store_ai_token cookie（Supabase 模式 / Spring Boot JWT 模式共用）
//   2. Supabase session cookie（兜底检查）
// ============================================================

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 公开路由：无需鉴权
  const isPublic =
    path === "/start" ||
    path.startsWith("/_next") ||
    path.startsWith("/api/") ||
    path === "/login" ||
    path === "/manifest.webmanifest" ||
    path === "/favicon.ico";

  if (isPublic) return NextResponse.next({ request });

  // 检查 store_ai_token cookie（Supabase 登录后 + Spring Boot JWT 都会设置）
  const storeToken = request.cookies.get("store_ai_token")?.value;
  if (storeToken) {
    return NextResponse.next({ request });
  }

  // 未登录 → 重定向到登录页
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)"],
};
