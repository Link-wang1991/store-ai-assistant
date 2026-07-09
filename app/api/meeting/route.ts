import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

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
        assigned_to: ctx.employee.id,
      });
      if (!c) return NextResponse.json({ error: "创建客户失败" }, { status: 500 });
      customerId = c.id;
    }

    // 已有客户但没传名字 → 从客户库查
    let meetingCustomerName = customerName;
    if (customerId && !meetingCustomerName) {
      const cust = await db.customers.getById(customerId, ctx.store.id);
      if (cust) meetingCustomerName = cust.name || "";
    }

    const m = await db.meetings.create({
      store_id: ctx.store.id,
      customer_id: customerId,
      employee_id: ctx.employee.id,
      scene,
      status: "recording",
      customer_name: meetingCustomerName,
      employee_name: ctx.employee.name,
    });
    if (!m) return NextResponse.json({ error: "创建会谈失败" }, { status: 500 });

    await db.meetingConsents.create({
      meeting_id: m.id,
      consented: true,
    });

    return NextResponse.json({ meetingId: m.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "创建会谈失败" }, { status: 500 });
  }
}
