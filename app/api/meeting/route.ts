import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const CONSENT_TEXT =
  "本次录音仅用于门店内部服务复盘、客户需求记录与后续服务优化，不对外公开。客户可随时要求停止录音或删除记录。";

// 创建一次会谈（选客户/新建客户 + 场景 + 同意确认）
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const scene: string = body?.scene || "new_consult";
  const consent: boolean = !!body?.consent;
  if (!consent) return NextResponse.json({ error: "需要客户同意才能开始录音" }, { status: 400 });

  let customerId: string | null = typeof body?.customerId === "string" && body.customerId ? body.customerId : null;
  const customerName: string = (body?.customerName || "").trim();

  try {
    // 新建客户（输入了名字但没选已有客户）
    if (!customerId && customerName) {
      const c = await db.customers.create({
        store_id: ctx.store.id,
        name: customerName,
        stage: "new",
        assigned_to: ctx.employee.id,
      });
      customerId = c.id;
    }

    const now = new Date().toISOString();
    const m = await db.meetings.create({
      store_id: ctx.store.id,
      customer_id: customerId,
      employee_id: ctx.employee.id,
      scene,
      status: "recording",
      started_at: now,
      consent_status: "agreed",
      consent_text: CONSENT_TEXT,
    });

    await db.meetingConsents.create({
      meeting_id: m.id,
      store_id: ctx.store.id,
      customer_id: customerId,
      consent_method: "checkbox",
      consent_text: CONSENT_TEXT,
      consented_at: now,
    });

    return NextResponse.json({ meetingId: m.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "创建会谈失败" }, { status: 500 });
  }
}
