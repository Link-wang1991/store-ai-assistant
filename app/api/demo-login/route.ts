import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { DEMO_EMAILS, DEMO_PASSWORD } from "@/lib/demo-accounts";

export const runtime = "nodejs";

const DEMO_EMAIL_SET = new Set(DEMO_EMAILS);

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function requestOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  return `${proto}://${host}`;
}

function redirectUrl(req: NextRequest, path: string): URL {
  return new URL(path, requestOrigin(req));
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

  const redirectTo = redirectUrl(req, next);
  let response = NextResponse.redirect(redirectTo);
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: DEMO_PASSWORD,
  });

  if (error) {
    return NextResponse.redirect(redirectUrl(req, `/login?error=${encodeURIComponent(error.message)}`));
  }

  return response;
}
