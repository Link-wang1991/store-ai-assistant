// ============================================================
// GET /api/knowledge — Supabase 直连模式
// 支持：?category= 过滤分类 | ?q=&topN= 关键词搜索
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../_auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const params = req.nextUrl.searchParams;
    const q = params.get("q");
    const topN = parseInt(params.get("topN") || "5", 10);
    const category = params.get("category") || undefined;

    // 获取启用文档
    let docs = await db.knowledge.listDocs(auth.storeId);

    // 按分类过滤
    if (category) {
      docs = docs.filter((d: any) => d.category === category);
    }

    // 按关键词过滤（简单 contains 搜索）
    if (q) {
      const kw = q.toLowerCase();
      docs = docs.filter(
        (d: any) =>
          (d.title || "").toLowerCase().includes(kw) ||
          (d.content || "").toLowerCase().includes(kw) ||
          (d.tags || []).some((t: string) => t.toLowerCase().includes(kw))
      );
      docs = docs.slice(0, topN);
    }

    return NextResponse.json({ code: 200, data: docs });
  } catch (e: any) {
    return NextResponse.json({ code: 500, message: e.message || "查询失败" }, { status: 500 });
  }
}
