import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { TASK_STATUS_LABELS, type TaskStatus } from "@/lib/constants";
import { TaskActions } from "@/components/TaskActions";
import { fmtTime } from "@/lib/format";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const tasks = await db.tasks.listByAssignee(ctx.store.id, ctx.employee.id);

  return (
    <div className="min-h-screen pb-8">
      <header className="flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3">
        <Link href="/me" className="text-slate-400">←</Link>
        <h1 className="text-base font-semibold text-slate-900">我的任务</h1>
      </header>

      <div className="space-y-3 p-4">
        {(tasks || []).length === 0 ? (
          <EmptyState text="暂无分配给你的任务" />
        ) : (
          (tasks || []).map((t: any) => (
            <div key={t.id} className="rounded-xl border border-slate-200/70 bg-white p-4">
              <div className="flex items-start justify-between">
                <div className="mr-2">
                  <div className="text-sm font-medium text-slate-900">{t.title}</div>
                  {t.task_type && <div className="mt-0.5 text-xs text-slate-400">{t.task_type}</div>}
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                  {TASK_STATUS_LABELS[t.status as TaskStatus] || t.status}
                </span>
              </div>
              {t.content && <p className="mt-2 text-sm text-slate-600">{t.content}</p>}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {t.deadline ? `截止 ${fmtTime(t.deadline)}` : "无截止时间"}
                </span>
                <TaskActions id={t.id} status={t.status} />
              </div>
              {t.owner_comment && (
                <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
                  老板点评：{t.owner_comment}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
