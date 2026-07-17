import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { type Role } from "@/lib/constants";
import { roleLabel } from "@/lib/roles";
import { replyPending, deletePendingQuestion } from "@/lib/actions";
import { ActionForm } from "@/components/ActionForm";
import { ActionButton } from "@/components/ActionButton";
import { Card, EmptyState } from "@/components/ui";
import { AdminBackHeader } from "@/components/AdminBackHeader";
import { fmtTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "待处理",
  replied: "已回复",
  added: "已加入标准答案",
  closed: "已关闭",
};

export default async function PendingPage() {
  const ctx = (await getAuthContext())!;
  const labels = ctx.roleLabels;
  const list = await db.pending.listByStore(ctx.store.id, 80);

  const pending = (list as any[]).filter((p) => p.status === "pending");
  const handled = (list as any[]).filter((p) => p.status !== "pending");

  return (
    <div>
      <AdminBackHeader title="待确认问题" subtitle={`待处理 ${pending.length} · 已处理 ${handled.length}`} />
      <div className="space-y-3 p-4">
        {list.length === 0 ? (
          <EmptyState text="暂无待确认问题" />
        ) : (
          <>
            {pending.map((p) => (
              <Card key={p.id}>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {p.employees?.name}（{roleLabel(p.employees?.role as Role, labels)}）· {fmtTime(p.created_at)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-medium text-slate-800">{p.question}</p>
                {p.ai_suggestion && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">AI 临时建议：{p.ai_suggestion}</p>
                )}
                <ActionForm action={replyPending} submitText="回复">
                  <input type="hidden" name="id" value={p.id} />
                  <textarea
                    name="reply"
                    rows={2}
                    placeholder="填写处理意见…"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                    required
                  />
                  <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <input type="checkbox" name="add_to_kb" /> 同时沉淀为标准答案
                  </label>
                </ActionForm>
              </Card>
            ))}

            {handled.length > 0 && <div className="pt-2 text-xs font-medium text-slate-400">已处理</div>}
            {handled.map((p) => (
              <Card key={p.id} className="opacity-70">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {p.employees?.name}（{roleLabel(p.employees?.role as Role, labels)}）
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                    {STATUS_LABEL[p.status] || p.status}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-slate-700">{p.question}</p>
                {p.owner_reply && (
                  <p className="mt-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">回复：{p.owner_reply}</p>
                )}
                <div className="mt-2 border-t border-slate-50 pt-2 text-right">
                  <ActionButton action={deletePendingQuestion.bind(null, p.id)} label="删除记录" confirmText="删除这条已处理记录？" className="text-xs text-red-400" />
                </div>
              </Card>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
