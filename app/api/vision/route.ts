import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { analyzeImage } from "@/lib/ai/multimodal";
import { readServerToken } from "@/lib/server-cookie";
import { API_BASE_URL } from "@/lib/data-source";

export const runtime = "nodejs";
// 图片体积可能较大
export const maxDuration = 60;

async function writeChatRecord(path: string, method: "POST" | "PUT", body: Record<string, unknown>) {
  const token = await readServerToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.code !== 200) {
    throw new Error(`${payload?.message || "图片会话保存失败"}（${method} ${path}）`);
  }
  return payload.data ?? {};
}

async function handlePost(req: NextRequest) {
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
  const requestedCustomerId: string | null = typeof body?.customerId === "string" && body.customerId.trim()
    ? body.customerId.trim()
    : null;
  if (!imageUrl) return NextResponse.json({ error: "缺少图片" }, { status: 400 });

  const canManageCustomers = ["owner", "manager", "admin"].includes(ctx.employee.role);
  let customer: any = null;
  if (requestedCustomerId) {
    customer = await db.customers.getById(requestedCustomerId, ctx.store.id);
    if (!customer) return NextResponse.json({ error: "客户不存在或不属于当前门店" }, { status: 404 });
    const assignee = customer.assigned_to || customer.assignedTo || null;
    if (!canManageCustomers && assignee !== ctx.employee.id) {
      return NextResponse.json({ error: "无权使用该客户的上下文" }, { status: 403 });
    }
  }

  try {
  let sessionId: string = body?.sessionId || "";
  let sessionCustomerId: string | null = null;
  if (sessionId) {
    const s = await db.chat.getSession(sessionId, ctx.employee.id);
    if (!s) {
      sessionId = "";
    } else {
      sessionCustomerId = s.customer_id || s.customerId || null;
      if (requestedCustomerId && sessionCustomerId && requestedCustomerId !== sessionCustomerId) {
        return NextResponse.json({ error: "该会话已关联其他客户，请新建对话后再切换客户" }, { status: 400 });
      }
      if (requestedCustomerId && !sessionCustomerId) {
        await writeChatRecord(`/api/proxy/chat_sessions/${sessionId}`, "PUT", { customer_id: requestedCustomerId });
        sessionCustomerId = requestedCustomerId;
      }
    }
  }
  const effectiveCustomerId = requestedCustomerId || sessionCustomerId;
  if (!sessionId) {
    const s = await writeChatRecord("/api/proxy/chat_sessions", "POST", {
      employee_id: ctx.employee.id,
      role: ctx.employee.role,
      title: "图片识别",
      customer_id: effectiveCustomerId,
    });
    if (!s?.id) throw new Error("图片会话创建失败");
    sessionId = s.id;
  }

  if (!customer && effectiveCustomerId) {
    customer = await db.customers.getById(effectiveCustomerId, ctx.store.id);
  }
  const customerHint = customer
    ? `当前客户：${customer.name || "未命名"}；阶段：${customer.stage || "未记录"}；顾虑：${customer.concerns || "未记录"}`
    : "";
  const contextualHint = [hint, customerHint].filter(Boolean).join("；");

    const result = await analyzeImage({
      imageUrl,
      role: ctx.employee.role as any,
      hint: contextualHint,
    });
    const riskLevel = result.needsUpgrade ? "L4" : "L1";
    const answerType = result.needsUpgrade ? "risk" : "knowledge";

    const msg = await writeChatRecord("/api/proxy/chat_messages", "POST", {
      session_id: sessionId,
      store_id: ctx.store.id,
      employee_id: ctx.employee.id,
      role: ctx.employee.role,
      content: "[图片]" + (hint ? ` ${hint}` : ""),
      user_message: "[图片]" + (hint ? ` ${hint}` : ""),
      ai_response: result.text,
      question_category: "其他问题",
      risk_level: riskLevel,
      answer_type: answerType,
      needs_review: result.needsUpgrade,
      customer_id: effectiveCustomerId,
    });
    if (!msg?.id) throw new Error("图片消息保存失败");
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
        customer_id: effectiveCustomerId,
      });
    }

    return NextResponse.json({
      sessionId,
      messageId: msg.id,
      answer: result.text,
      riskLevel,
      answerType,
      needsUpgrade: result.needsUpgrade,
      customerId: effectiveCustomerId,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "图片处理失败" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "图片处理失败" }, { status: 500 });
  }
}
