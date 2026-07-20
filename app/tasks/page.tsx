import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { TASK_STATUS_LABELS, type TaskStatus } from "@/lib/constants";
import { TaskActions } from "@/components/TaskActions";
import { fmtTime } from "@/lib/format";
import { EmptyState } from "@/components/ui";
import { canEnterAdmin } from "@/lib/permissions";
import { BottomNav, MAIN_NAV, STAFF_NAV } from "@/components/BottomNav";
import { SubpageHeader } from "@/components/SubpageHeader";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const tasks = await db.tasks.listByAssignee(ctx.store.id, ctx.employee.id);
  const nav = canEnterAdmin(ctx) ? MAIN_NAV : STAFF_NAV;

  return (
    <div className="subpage-shell">
      <SubpageHeader title="我的任务" description="按优先级完成今天需要推进的事项" />

      <main className="subpage-content space-y-3">
        {(tasks || []).length === 0 ? (
          <EmptyState text="暂无分配给你的任务" />
        ) : (
          (tasks || []).map((t: any) => (
            <div key={t.id} className="subpage-card p-4">
              <div className="flex items-start justify-between">
                <div className="mr-2">
                  <div className="text-sm font-semibold text-[var(--ink)]">{t.title}</div>
                  {t.task_type && <div className="mt-0.5 text-xs text-[var(--faint)]">{t.task_type}</div>}
                </div>
                <span className="subpage-status">
                  {TASK_STATUS_LABELS[t.status as TaskStatus] || t.status}
                </span>
              </div>
              {t.content && <p className="mt-2 text-sm text-[var(--muted)]">{t.content}</p>}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-[var(--faint)]">
                  {t.deadline ? `截止 ${fmtTime(t.deadline)}` : "无截止时间"}
                </span>
                <TaskActions id={t.id} status={t.status} />
              </div>
              {t.owner_comment && (
                <p className="subpage-note mt-2">
                  老板点评：{t.owner_comment}
                </p>
              )}
            </div>
          ))
        )}
      </main>
      <BottomNav items={nav} activeHref="/me" />
    </div>
  );
}
