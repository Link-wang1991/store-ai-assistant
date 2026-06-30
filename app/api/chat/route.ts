import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { answerQuestion } from "@/lib/ai/pipeline";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "未登录或账号已停用" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const question: string = (body?.question || "").trim();
  if (!question) return NextResponse.json({ error: "问题不能为空" }, { status: 400 });

  let sessionId: string | null = body?.sessionId || null;

  // 校验 session 归属
  if (sessionId) {
    const s = await db.chat.getSession(sessionId, ctx.employee.id);
    if (!s) sessionId = null;
  }

  // 无 session 则新建
  if (!sessionId) {
    try {
      const s = await db.chat.createSession({
        store_id: ctx.store.id,
        employee_id: ctx.employee.id,
        role: ctx.employee.role,
        title: question.slice(0, 20),
      });
      sessionId = s.id;
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  const customerId: string | undefined =
    typeof body?.customerId === "string" && body.customerId ? body.customerId : undefined;

  try {
    const result = await answerQuestion(ctx, sessionId!, question, { customerId });
    return NextResponse.json({ sessionId, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "处理失败" }, { status: 500 });
  }
}
