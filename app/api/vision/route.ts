import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { analyzeImage } from "@/lib/ai/multimodal";

export const runtime = "nodejs";
// 图片体积可能较大
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "未登录或账号已停用" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const imageUrl: string = body?.imageUrl || "";
  const hint: string = body?.hint || "";
  if (!imageUrl) return NextResponse.json({ error: "缺少图片" }, { status: 400 });

  let sessionId: string = body?.sessionId || "";
  if (sessionId) {
    const s = await db.chat.getSession(sessionId, ctx.employee.id);
    if (!s) sessionId = "";
  }
  if (!sessionId) {
    const s = await db.chat.createSession({
      store_id: ctx.store.id,
      employee_id: ctx.employee.id,
      role: ctx.employee.role,
      title: "图片识别",
    });
    sessionId = s.id;
  }

  try {
    const result = await analyzeImage({
      imageUrl,
      role: ctx.employee.role as any,
      hint,
    });
    const riskLevel = result.needsUpgrade ? "L4" : "L1";
    const answerType = result.needsUpgrade ? "risk" : "knowledge";

    const msg = await db.chat.insertMessage({
      session_id: sessionId,
      store_id: ctx.store.id,
      employee_id: ctx.employee.id,
      role: ctx.employee.role,
      user_message: "[图片]" + (hint ? ` ${hint}` : ""),
      ai_response: result.text,
      question_category: "其他问题",
      risk_level: riskLevel,
      answer_type: answerType,
      needs_review: result.needsUpgrade,
    });
    await db.chat.touchSession(sessionId);

    // 涉及皮肤/术后等 → 进风险记录
    if (result.needsUpgrade) {
      await db.risks.create({
        store_id: ctx.store.id,
        employee_id: ctx.employee.id,
        question: "[图片] 客户反馈/皮肤相关，需人工判断",
        ai_response: result.text,
        risk_type: "医美健康异常",
        risk_level: "L4",
        status: "open",
      });
    }

    return NextResponse.json({
      sessionId,
      messageId: msg.id,
      answer: result.text,
      riskLevel,
      answerType,
      needsUpgrade: result.needsUpgrade,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "图片处理失败" }, { status: 500 });
  }
}
