import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLES, ANNOUNCEMENT_TYPES } from "@/lib/constants";
import { roleLabel } from "@/lib/roles";
import { hasPermission } from "@/lib/permissions";
import { createAnnouncement, toggleAnnouncement, announcementToTask, deleteAnnouncement } from "@/lib/actions";
import { ActionForm } from "@/components/ActionForm";
import { ActionButton } from "@/components/ActionButton";
import { Card, EmptyState } from "@/components/ui";
import { AdminBackHeader } from "@/components/AdminBackHeader";
import { fmtTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ANNOUNCEMENT_TYPES.map((t) => [t.key, t.label])
);

export default async function AnnouncementsPage() {
  const ctx = (await getAuthContext())!;
  if (!hasPermission(ctx, "campaigns", "view")) redirect("/admin");
  const labels = ctx.roleLabels;
  const [list, defs, emps] = await Promise.all([
    db.announcements.listAll(ctx.store.id),
    db.roles.listActiveDefinitions(ctx.store.id),
    db.employees.listActiveByStore(ctx.store.id),
  ]);
  const roleOpts =
    (defs as any[]).length > 0
      ? (defs as any[]).map((d) => ({ key: d.role_key, name: d.display_name }))
      : ROLES.map((r) => ({ key: r, name: roleLabel(r, labels) }));

  const inputCls =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <div>
      <AdminBackHeader title="通知中心" subtitle="排班/培训/活动/制度通知，员工端与 AI 都能看到" />
      <div className="space-y-4 p-4">
        <Card>
          <div className="mb-2 text-sm font-semibold text-slate-700">发布通知</div>
          <ActionForm action={createAnnouncement} submitText="发布" resetOnSuccess className="space-y-2">
            <input name="title" placeholder="标题，如：7月活动销售培训" className={inputCls} required />
            <textarea name="content" rows={3} placeholder="内容，如：明天下午3点会议室，全体咨询师参加" className={inputCls} />
            <div className="grid grid-cols-2 gap-2">
              <select name="announcement_type" className={inputCls} defaultValue="general">
                {ANNOUNCEMENT_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
              <input name="priority" type="number" placeholder="优先级(数字越大越靠前)" className={inputCls} defaultValue={0} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">可见角色（都不选 = 全员可见）</div>
              <div className="grid grid-cols-3 gap-2">
                {roleOpts.map((o) => (
                  <label key={o.key} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                    <input type="checkbox" name="visible_roles" value={o.key} />
                    {o.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">指定员工（可选，优先于角色）</div>
              <div className="grid max-h-32 grid-cols-2 gap-2 overflow-y-auto">
                {(emps as any[]).map((e) => (
                  <label key={e.id} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                    <input type="checkbox" name="target_employee_ids" value={e.id} />
                    {e.name}（{roleLabel(e.role, labels)}）
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mb-1 text-xs text-slate-500">生效时间(选填)</div>
                <input name="start_at" type="datetime-local" className={inputCls} />
              </div>
              <div>
                <div className="mb-1 text-xs text-slate-500">结束时间(选填)</div>
                <input name="end_at" type="datetime-local" className={inputCls} />
              </div>
            </div>
          </ActionForm>
        </Card>

        <div className="space-y-2">
          {(list as any[]).length === 0 ? (
            <EmptyState text="还没有发布通知" />
          ) : (
            (list as any[]).map((a) => (
              <Card key={a.id} className={a.status !== "active" ? "opacity-60" : ""}>
                <div className="flex items-start justify-between">
                  <div className="mr-2">
                    <span className="mr-2 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] text-brand-dark">
                      {TYPE_LABEL[a.announcement_type] || a.announcement_type}
                    </span>
                    <span className="text-sm font-medium text-slate-900">{a.title}</span>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{fmtTime(a.created_at)}</span>
                </div>
                {a.content && <p className="mt-1.5 text-sm text-slate-600">{a.content}</p>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {(a.visible_roles || []).length === 0 ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">全员可见</span>
                  ) : (
                    (a.visible_roles || []).map((r: string) => (
                      <span key={r} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                        {roleLabel(r, labels)}
                      </span>
                    ))
                  )}
                </div>
                <div className="mt-3 flex gap-4 border-t border-slate-50 pt-3">
                  <ActionButton
                    action={announcementToTask.bind(null, a.id)}
                    label="转为执行任务"
                    className="text-xs text-brand-dark"
                  />
                  <ActionButton
                    action={toggleAnnouncement.bind(null, a.id)}
                    label={a.status === "active" ? "下线" : "恢复"}
                    className="text-xs text-slate-500"
                  />
                  <ActionButton
                    action={deleteAnnouncement.bind(null, a.id)}
                    label="删除"
                    confirmText={`删除通知「${a.title}」？`}
                    className="text-xs text-red-500"
                  />
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
