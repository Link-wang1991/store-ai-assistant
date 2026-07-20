import { NextRequest, NextResponse } from "next/server";
import { DEMO_EMAILS, DEMO_PASSWORD } from "@/lib/demo-accounts";
import { API_BASE_URL } from "@/lib/data-source";

export const runtime = "nodejs";

const DEMO_EMAIL_SET = new Set(DEMO_EMAILS);

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function redirectUrl(req: NextRequest, path: string) {
  const url = new URL(req.url);
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = req.headers.get("host")?.split(",")[0]?.trim();
  const host = forwardedHost || requestHost;
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();

  // `next dev -H 0.0.0.0` reports its bind address in req.url.  That address
  // cannot be opened by a browser, so always restore the host the user used.
  if (host && !host.startsWith("0.0.0.0")) url.host = host;
  if (url.hostname === "0.0.0.0") url.hostname = "localhost";
  if (forwardedProto === "http" || forwardedProto === "https") url.protocol = `${forwardedProto}:`;

  return new URL(path, url);
}

export async function GET(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") {
    return NextResponse.redirect(redirectUrl(req, "/login?error=demo_disabled"));
  }

  const email = (req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (!DEMO_EMAIL_SET.has(email)) {
    return NextResponse.redirect(redirectUrl(req, "/login?error=demo_account"));
  }

  // 通过后端 API 登录
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: DEMO_PASSWORD }),
    });
    const json = await res.json();
    if (json.code !== 200 || !json.data?.token) {
      return NextResponse.redirect(redirectUrl(req, `/login?error=${encodeURIComponent(json.message || "登录失败")}`));
    }

    const response = NextResponse.redirect(redirectUrl(req, next));
    const token = json.data.token;
    response.cookies.set("store_ai_token", token, { path: "/", maxAge: 7 * 24 * 60 * 60, sameSite: "lax" });
    return response;
  } catch {
    return NextResponse.redirect(redirectUrl(req, "/login?error=backend_unavailable"));
  }
}
