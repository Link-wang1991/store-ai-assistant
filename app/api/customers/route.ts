// ============================================================
// GET /api/customers — Supabase 直连模式：个人客户列表
// 首页用，每个人都只看自己负责的客户
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../_auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const data = await db.customers.listByAssignee(auth.storeId, auth.employeeId);
    return NextResponse.json({ code: 200, data });
  } catch (e: any) {
    return NextResponse.json({ code: 500, message: e.message || "查询失败" }, { status: 500 });
  }
}
