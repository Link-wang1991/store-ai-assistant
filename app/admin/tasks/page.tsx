import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { TASK_TYPES, TASK_STATUS_LABELS, type TaskStatus } from "@/lib/constants";
import { roleLabel } from "@/lib/roles";
import { createTask } from "@/lib/actions";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { fmtTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminTasksPage() {
  const ctx = (await getAuthContext())!;
  const [employees, tasks] = await Promise.all([
    db.employees.listActiveByStore(ctx.store.id),
    db.tasks.listByStore(ctx.store.id),
  ]);
  const labels = ctx.roleLabels;

  const inputCls =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <div>
      <PageHeader title="增长动作" subtitle="推动客户跟进 / 活动转化 / 老客唤醒 / 服务补救 / 员工训练" />
      <div className="space-y-4 p-4">
        <Card>
          <div className="mb-2 text-sm font-semibold text-slate-700">➕ 新建增长动作</div>
          <ActionForm action={createTask} submitText="创建跟进动作" resetOnSuccess className="space-y-2">
            <input name="title" placeholder="动作标题（如：唤醒沉默老客、推进体验客成交）" className={inputCls} required />
            <textarea name="content" rows={2} placeholder="动作内容（选填）" className={inputCls} />
            <select name="task_type" className={inputCls} defaultValue="">
              <option value="">动作类型（选填）</option>
              {TASK_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select name="assigned_to" className={inputCls} defaultValue="">
              <option value="">分配给…（选填）</option>
              {(employees || []).map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.name}（{roleLabel(e.role, labels)}）
                </option>
              ))}
            </select>
            <div>
              <label className="mb-1 block text-xs text-slate-500">截止时间（选填）</label>
              <input name="deadline" type="datetime-local" className={inputCls} />
            </div>
          </ActionForm>
        </Card>

        <div className="space-y-2">
          {(tasks || []).length === 0 ? (
            <EmptyState text="还没有创建增长动作" />
          ) : (
            (tasks || []).map((t: any) => (
              <Card key={t.id}>
                <div className="flex items-start justify-between">
                  <div className="mr-2">
                    <div className="text-sm font-medium text-slate-900">{t.title}</div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {t.task_type || "未分类"} ·{" "}
                      {t.employees ? `${t.employees.name}（${roleLabel(t.employees.role, labels)}）` : "未分配"}
                      {t.deadline && ` · 截止 ${fmtTime(t.deadline)}`}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                    {TASK_STATUS_LABELS[t.status as TaskStatus] || t.status}
                  </span>
                </div>
                {t.content && <p className="mt-2 text-sm text-slate-600">{t.content}</p>}
                {t.feedback && (
                  <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700">
                    完成反馈：{t.feedback}
                  </p>
                )}
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
