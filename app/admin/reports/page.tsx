import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { todayRange, fmtDate } from "@/lib/format";
import { PageHeader, Card, StatCard, SectionHeader } from "@/components/ui";
import { DailyReportButton } from "@/components/DailyReportButton";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const ctx = (await getAuthContext())!;
  if (!hasPermission(ctx, "reports", "view")) redirect("/admin");

  const storeId = ctx.store.id;
  const { start: todayStart } = todayRange();

  const [todayMeta, custs, fuStats, fuOpen, fbs, riskOpen, gapPending, historyReports] =
    await Promise.all([
      db.chat.listMetaSince(storeId, todayStart),
      db.customers.listByStore(storeId),
      db.followups.statsByStore(storeId),
      db.followups.countOpen(storeId),
      db.feedback.listByStore(storeId, 100),
      db.risks.countOpen(storeId),
      db.gaps.countPending(storeId),
      db.reports.listByStore(storeId, "daily", 7),
    ]);

  // 经营指标
  const stageCount: Record<string, number> = {};
  let newToday = 0;
  for (const c of custs as any[]) {
    stageCount[c.stage] = (stageCount[c.stage] || 0) + 1;
    if (c.created_at && c.created_at >= todayStart) newToday++;
  }
  const fuTotal = (fuStats as any).total || 0;
  const doneRate = fuTotal > 0 ? Math.round((((fuStats as any).done || 0) / fuTotal) * 100) : 0;
  const abnormalCount = (fbs as any[]).filter((f) => f.risk_flag).length;
  const aiUsage = todayMeta.length;

  return (
    <div>
      <PageHeader title="增长复盘" subtitle={`${fmtDate(new Date().toISOString())} · 成交卡点 / 客户 / 风险 / 明日动作`} />
      <div className="space-y-4 p-4">
        {/* 一键生成经营日报 */}
        <DailyReportButton />

        {/* 经营指标 */}
        <section>
          <SectionHeader title="经营指标" />
          <div className="grid grid-cols-3 gap-2.5">
            <StatCard label="今日新客" value={newToday} accent="text-emerald-600" />
            <StatCard label="意向客户" value={stageCount["intent"] || 0} />
            <StatCard label="回访完成率" value={doneRate + "%"} />
            <StatCard label="待跟进回访" value={fuOpen} accent="text-amber-600" />
            <StatCard label="客户异常" value={abnormalCount} accent="text-red-600" href="/admin/risks" />
            <StatCard label="风险问题" value={riskOpen} accent="text-red-600" href="/admin/risks" />
            <StatCard label="知识库缺口" value={gapPending} accent="text-sky-600" href="/admin/knowledge/gaps" />
            <StatCard label="AI使用(次要)" value={aiUsage} href="/admin/chats" />
          </div>
        </section>

        {/* 历史经营日报 */}
        <section>
          <SectionHeader title="历史经营日报" />
          {(historyReports as any[]).length === 0 ? (
            <Card><p className="text-sm text-slate-400">还没有生成过日报，点上方「生成日报」试试</p></Card>
          ) : (
            <div className="space-y-2">
              {(historyReports as any[]).map((r) => (
                <details key={r.id} className="rounded-xl border border-slate-200/70 bg-white p-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">
                    {r.date_range || fmtDate(r.created_at)} 经营日报
                  </summary>
                  <div className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                    {r.content?.text || "（无内容）"}
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
