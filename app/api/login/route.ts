import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/data-source";

export async function POST(req: NextRequest) {
  const body = await req.json();
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();

    if (json.code !== 200) {
      return NextResponse.json(json, { status: 401 });
    }

    const token = json.data?.token;
    if (token) {
      const resp = NextResponse.json(json);
      resp.cookies.set("store_ai_token", token, {
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
        sameSite: "lax",
      });
      return resp;
    }

    return NextResponse.json(json);
  } catch {
    return NextResponse.json(
      { code: 500, message: "无法连接到登录服务，请确认后端已启动" },
      { status: 500 }
    );
  }
}
