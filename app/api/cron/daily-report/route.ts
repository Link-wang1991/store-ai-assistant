import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildAndSaveDailyReport } from "@/lib/ai/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // 不在 build 时预渲染（会触发真实 AI 调用）
export const maxDuration = 60;

// 定时生成各门店今日日报。
// - 部署到 Vercel 后由 vercel.json 的 cron 每天触发（自动带 CRON_SECRET）。
// - 本地可手动：curl http://localhost:3000/api/cron/daily-report
//   若设置了 CRON_SECRET，则需带 -H "Authorization: Bearer <CRON_SECRET>"。
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const stores = await db.stores.listActive();
  const results: any[] = [];
  for (const s of stores as any[]) {
    try {
      const r = await buildAndSaveDailyReport(s);
      results.push({ store: s.id, ok: true, reportId: r.reportId });
    } catch (e: any) {
      results.push({ store: s.id, ok: false, error: e.message });
    }
  }
  return NextResponse.json({ generated: results.length, results });
}
