import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { type Role } from "@/lib/constants";
import { roleLabel } from "@/lib/roles";
import { hasPermission } from "@/lib/permissions";
import { resolveRisk, deleteRisk } from "@/lib/actions";
import { ActionForm } from "@/components/ActionForm";
import { ActionButton } from "@/components/ActionButton";
import { PageHeader, Card, RiskBadge, EmptyState } from "@/components/ui";
import { fmtTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RisksPage() {
  const ctx = (await getAuthContext())!;
  if (!hasPermission(ctx, "risks", "view")) redirect("/admin");
  const labels = ctx.roleLabels;
  const risks = await db.risks.listByStore(ctx.store.id, 80);

  const open = (risks as any[]).filter((r) => r.status === "open");
  const closed = (risks as any[]).filter((r) => r.status !== "open");

  return (
    <div>
      <PageHeader title="风险记录" subtitle={`待处理 ${open.length} · 已处理 ${closed.length}`} />
      <div className="space-y-3 p-4">
        {risks.length === 0 ? (
          <EmptyState text="暂无风险记录 👍" />
        ) : (
          <>
            {open.map((r) => (
              <Card key={r.id} className="border-red-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {r.employees?.name}（{roleLabel(r.employees?.role as Role, labels)}）· {fmtTime(r.created_at)}
                  </span>
                  <RiskBadge level={r.risk_level || "L4"} />
                </div>
                <p className="mt-1.5 text-sm font-medium text-slate-800">
                  {r.question?.includes("[图片]") && (
                    <span className="mr-1 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-700">📷 图片</span>
                  )}
                  {r.question}
                </p>
                {r.ai_response && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-slate-400">查看 AI 处理建议</summary>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{r.ai_response}</p>
                  </details>
                )}
                <ActionForm action={resolveRisk} submitText="标记已处理">
                  <input type="hidden" name="id" value={r.id} />
                  <textarea
                    name="result"
                    rows={2}
                    placeholder="填写处理结果…"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                    required
                  />
                </ActionForm>
              </Card>
            ))}

            {closed.length > 0 && (
              <div className="pt-2 text-xs font-medium text-slate-400">已处理</div>
            )}
            {closed.map((r) => (
              <Card key={r.id} className="opacity-70">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {r.employees?.name}（{roleLabel(r.employees?.role as Role, labels)}）· {fmtTime(r.created_at)}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">已处理</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-700">{r.question}</p>
                {r.handled_result && (
                  <p className="mt-1 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700">处理结果：{r.handled_result}</p>
                )}
                <div className="mt-2 border-t border-slate-50 pt-2 text-right">
                  <ActionButton action={deleteRisk.bind(null, r.id)} label="删除记录" confirmText="删除这条已处理的风险记录？" className="text-xs text-red-400" />
                </div>
              </Card>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
