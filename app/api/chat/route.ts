import { NextRequest, NextResponse } from "next/server";
import { getAuthContext as jwtGetAuth } from "@/app/api/_auth";
import { API_BASE_URL } from "@/lib/data-source";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const question: string = (body?.question || "").trim();
  if (!question) return NextResponse.json({ error: "问题不能为空" }, { status: 400 });

  const customerId: string | undefined =
    typeof body?.customerId === "string" && body.customerId ? body.customerId : undefined;

  const jwtCtx = await jwtGetAuth(req);
  if (!jwtCtx) return NextResponse.json({ error: "未登录" }, { status: 401 });

  try {
    const backendRes = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${req.cookies.get("store_ai_token")?.value || ""}`,
      },
      body: JSON.stringify({
        question,
        sessionId: body?.sessionId || null,
        customerId,
      }),
    });
    const backendData = await backendRes.json();
    if (backendData.code !== 200) {
      return NextResponse.json({ error: backendData.message || "后端处理失败" }, { status: 500 });
    }
    return NextResponse.json(backendData.data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "后端连接失败" }, { status: 500 });
  }
}
