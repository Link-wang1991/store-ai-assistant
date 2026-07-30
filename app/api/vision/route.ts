import { NextRequest, NextResponse } from "next/server";
import { analyzeImage } from "@/lib/ai/multimodal";
import { readServerToken } from "@/lib/server-cookie";
import { BACKEND_API_BASE_URL } from "@/lib/data-source";

export const runtime = "nodejs";
export const maxDuration = 120;

function clipped(value: string, max = 2_400) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}

/**
 * 图片先由视觉模型做“客观信息提取”，再交给 Java 的正式 AI 教练管线。
 *
 * 这样图片、文字和会谈使用同一份客户权限、门店资料、系统销售方法论、风险规则、
 * 会话持久化与任务提案逻辑；不再通过旧 Proxy 直接写 chat_messages。
 */
export async function POST(request: NextRequest) {
  const token = await readServerToken();
  if (!token) return NextResponse.json({ error: "登录已失效，请重新登录后再分析图片。" }, { status: 401 });

  let body: { imageUrl?: string; hint?: string; sessionId?: string; customerId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : "";
  const hint = typeof body.hint === "string" ? body.hint.trim() : "";
  if (!imageUrl) return NextResponse.json({ error: "缺少图片" }, { status: 400 });

  try {
    // 视觉层不拥有客户、会话或业务写权限；它只输出图片的客观观察结果。
    const vision = await analyzeImage({ imageUrl, role: "consultant", hint });
    const safetyPrefix = vision.needsUpgrade
      ? "系统图片安全检查：疑似涉及皮肤、术后或其他需负责人介入的情况，必须按高风险升级处理，不得自行做医疗判断。\n"
      : "";
    const question = `${safetyPrefix}[图片辅助分析${hint ? ` · ${hint}` : ""}]\n图片识别的客观信息：${clipped(vision.text)}\n\n请结合当前客户上下文、门店资料和系统销售方法论，给出可执行但不越权的沟通建议。`;
    const upstream = await fetch(`${BACKEND_API_BASE_URL.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Idempotency-Key": `vision-${crypto.randomUUID()}`,
      },
      body: JSON.stringify({
        question,
        sessionId: typeof body.sessionId === "string" && body.sessionId.trim() ? body.sessionId.trim() : null,
        customerId: typeof body.customerId === "string" && body.customerId.trim() ? body.customerId.trim() : null,
      }),
      cache: "no-store",
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok || payload?.code !== 200 || !payload?.data) {
      return NextResponse.json({ error: payload?.message || "图片信息已识别，但 AI 教练暂时无法生成建议。" }, { status: upstream.status || 502 });
    }
    return NextResponse.json({ ...payload.data, needsUpgrade: vision.needsUpgrade });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "图片处理失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
