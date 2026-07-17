import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { roleLabel } from "@/lib/roles";
import { resolveGap, closeGap, gapToTask, deleteGap } from "@/lib/actions";
import { ActionForm } from "@/components/ActionForm";
import { ActionButton } from "@/components/ActionButton";
import { KnowledgeTabs } from "@/components/KnowledgeTabs";
import { Card, EmptyState } from "@/components/ui";
import { AdminBackHeader } from "@/components/AdminBackHeader";
import { fmtTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function GapsPage() {
  const ctx = (await getAuthContext())!;
  const [gaps, employees] = await Promise.all([
    db.gaps.listPending(ctx.store.id),
    db.employees.listActiveByStore(ctx.store.id),
  ]);
  const labels = ctx.roleLabels;

  return (
    <div>
      <AdminBackHeader title="知识库缺口" subtitle="员工问了但知识库没有标准答案的问题" />
      <KnowledgeTabs />
      <div className="space-y-3 p-4">
        {(gaps || []).length === 0 ? (
          <EmptyState text="暂无知识库缺口，知识库覆盖得不错" />
        ) : (
          (gaps || []).map((g: any) => (
            <Card key={g.id}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {g.employees?.name}（{roleLabel(g.employees?.role, labels)}）
                  {g.frequency > 1 && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
                      高频 ×{g.frequency}
                    </span>
                  )}
                </span>
                <span className="text-xs text-slate-400">{fmtTime(g.created_at)}</span>
              </div>
              <p className="mt-1.5 text-sm font-medium text-slate-800">{g.question}</p>
              {g.category && <span className="text-xs text-slate-400">{g.category}</span>}
              {g.ai_temp_answer && (
                <p className="mt-1.5 line-clamp-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
                  AI 当时的临时建议：{g.ai_temp_answer}
                </p>
              )}

              {/* 转为标准答案 */}
              <ActionForm action={resolveGap} submitText="转为标准答案">
                <input type="hidden" name="id" value={g.id} />
                <textarea
                  name="answer"
                  rows={2}
                  placeholder="填写门店标准答案，写入标准答案库…"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </ActionForm>

              {/* 转为补充任务（可指定负责人 / 截止）*/}
              <details className="mt-3 border-t border-slate-50 pt-3">
                <summary className="cursor-pointer text-xs text-brand-dark">转为补充任务</summary>
                <ActionForm action={gapToTask} submitText="创建补充任务" className="mt-2 space-y-2">
                  <input type="hidden" name="id" value={g.id} />
                  <select
                    name="assigned_to"
                    defaultValue=""
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                  >
                    <option value="">分配给…（选填）</option>
                    {employees.map((e: any) => (
                      <option key={e.id} value={e.id}>
                        {e.name}（{roleLabel(e.role, labels)}）
                      </option>
                    ))}
                  </select>
                  <input
                    name="deadline"
                    type="datetime-local"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                </ActionForm>
              </details>

              <div className="mt-2 flex justify-end gap-4 text-right">
                <ActionButton
                  action={closeGap.bind(null, g.id)}
                  label="标记已处理"
                  confirmText="确定关闭该缺口？"
                  className="text-xs text-slate-500"
                />
                <ActionButton
                  action={deleteGap.bind(null, g.id)}
                  label="删除"
                  confirmText="删除该知识缺口记录？"
                  className="text-xs text-red-400"
                />
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
