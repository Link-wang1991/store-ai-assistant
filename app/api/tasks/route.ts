// ============================================================
// GET /api/tasks — Supabase 直连模式：个人任务列表
// 首页用，每个人都只看自己负责的任务
// 可选 ?status= 过滤
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../_auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const status = req.nextUrl.searchParams.get("status");
    let data = await db.tasks.listByAssignee(auth.storeId, auth.employeeId);
    if (status) {
      data = data.filter((t: any) => t.status === status);
    }
    return NextResponse.json({ code: 200, data });
  } catch (e: any) {
    return NextResponse.json({ code: 500, message: e.message || "查询失败" }, { status: 500 });
  }
}
