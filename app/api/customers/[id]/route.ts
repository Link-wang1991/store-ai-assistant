// ============================================================
// GET /api/customers/[id] — Supabase 直连模式：客户详情
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../../_auth";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const data = await db.customers.getById(id, auth.storeId);
    if (!data) return NextResponse.json({ code: 404, message: "客户不存在" }, { status: 404 });
    return NextResponse.json({ code: 200, data });
  } catch (e: any) {
    return NextResponse.json({ code: 500, message: e.message || "查询失败" }, { status: 500 });
  }
}
