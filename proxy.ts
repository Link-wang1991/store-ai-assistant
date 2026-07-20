import { NextResponse, type NextRequest } from "next/server";

// 路由鉴权只做导航兜底；所有数据接口仍由 Java 后端验证 Bearer JWT 签名。
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic =
    path === "/start" ||
    path === "/" ||
    path.startsWith("/_next") ||
    path.startsWith("/api/") ||
    path === "/login" ||
    path === "/register" ||
    path === "/manifest.webmanifest" ||
    path === "/favicon.ico";

  if (isPublic) return NextResponse.next({ request });

  if (request.cookies.get("store_ai_token")?.value) {
    return NextResponse.next({ request });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)"],
};
