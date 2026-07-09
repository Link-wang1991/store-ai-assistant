import { NextResponse } from "next/server";

export async function POST() {
  const resp = NextResponse.json({ ok: true });
  resp.cookies.set("store_ai_token", "", { path: "/", maxAge: 0 });
  resp.cookies.set("roleLabel", "", { path: "/", maxAge: 0 });
  return resp;
}
