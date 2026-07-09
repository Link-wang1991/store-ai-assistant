import { NextRequest, NextResponse } from "next/server";
import { DEMO_EMAILS, DEMO_PASSWORD } from "@/lib/demo-accounts";
import { API_BASE_URL } from "@/lib/data-source";

export const runtime = "nodejs";

const DEMO_EMAIL_SET = new Set(DEMO_EMAILS);

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") {
    return NextResponse.redirect(new URL("/login?error=demo_disabled", req.url));
  }

  const email = (req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (!DEMO_EMAIL_SET.has(email)) {
    return NextResponse.redirect(new URL("/login?error=demo_account", req.url));
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
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(json.message || "登录失败")}`, req.url));
    }

    const response = NextResponse.redirect(new URL(next, req.url));
    const token = json.data.token;
    response.cookies.set("store_ai_token", token, { path: "/", maxAge: 7 * 24 * 60 * 60, sameSite: "lax" });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=backend_unavailable", req.url));
  }
}
