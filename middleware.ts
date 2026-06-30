import { NextResponse, type NextRequest } from "next/server";

// 简化 middleware：仅做路由保护，登录态由 Spring Boot JWT 接管。
// 检查是否存在 store_ai_token cookie / localStorage 标记。
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAuthPage = path === "/login";
  const isPublic =
    path === "/start" ||
    path.startsWith("/_next") ||
    path.startsWith("/api/") ||
    path === "/manifest.webmanifest" ||
    path === "/favicon.ico";

  if (isPublic) return NextResponse.next({ request });

  // 读取 token cookie（登录时由客户端设置）
  const token = request.cookies.get("store_ai_token")?.value;

  if (!token && !isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (token && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)"],
};
