// ============================================================
// GET /api/meetings/unanalyzed-count
// Supabase 模式：统计未复盘会谈数（首页用）
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../_auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { pathname } = req.nextUrl;

  // /api/meetings/unanalyzed-count
  if (pathname.endsWith("/unanalyzed-count")) {
    try {
      const count = await db.meetings.countUnanalyzed(auth.storeId, auth.employeeId);
      return NextResponse.json({ code: 200, data: count });
    } catch (e: any) {
      return NextResponse.json({ code: 500, message: e.message }, { status: 500 });
    }
  }

  // 默认：会谈列表（只返回个人的）
  try {
    const data = await db.meetings.listByEmployee(auth.storeId, auth.employeeId);
    return NextResponse.json({ code: 200, data });
  } catch (e: any) {
    return NextResponse.json({ code: 500, message: e.message }, { status: 500 });
  }
}
