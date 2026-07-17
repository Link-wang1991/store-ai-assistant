import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { roleLabel } from "@/lib/roles";
import { KNOWLEDGE_CATEGORIES } from "@/lib/constants";
import { toggleKnowledgeDoc, deleteKnowledgeDoc } from "@/lib/actions";
import { KnowledgeTabs } from "@/components/KnowledgeTabs";
import { ActionButton } from "@/components/ActionButton";
import { KnowledgeCategoryEdit } from "@/components/KnowledgeCategoryEdit";
import { EmptyState } from "@/components/ui";
import { AdminBackHeader } from "@/components/AdminBackHeader";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function KnowledgeListPage() {
  const ctx = (await getAuthContext())!;
  if (!hasPermission(ctx, "knowledge", "view")) redirect("/admin");
  const canEdit = hasPermission(ctx, "knowledge", "edit");
  const docs = await db.knowledge.listDocs(ctx.store.id);
  const labels = ctx.roleLabels;

  // 统计每个文档的片段数
  const docIds = await db.knowledge.listChunkDocIds(ctx.store.id);
  const chunkCount: Record<string, number> = {};
  for (const id of docIds) {
    chunkCount[id] = (chunkCount[id] || 0) + 1;
  }

  // 分类选项（门店自定义优先，否则默认）+ 现有资料里已用到的分类，供「转移分类」下拉
  const cfg = (await db.config.listByStore(ctx.store.id).catch(() => [])) as any[];
  const kbCats = cfg.filter((r) => r.category === "knowledge" && r.enabled).map((r) => r.display_name);
  const usedCats = Array.from(new Set((docs as any[]).map((d) => d.category).filter(Boolean)));
  const categoryOptions = Array.from(new Set([...(kbCats.length ? kbCats : KNOWLEDGE_CATEGORIES), ...usedCats]));

  return (
    <div>
      <AdminBackHeader title="知识库" subtitle="门店专属知识，AI 回答的依据" />
      <KnowledgeTabs />
      <div className="space-y-2.5 p-4">
        <div className="grid grid-cols-2 gap-2.5">
          <Link
            href="/admin/knowledge/upload"
            className="block rounded-xl border border-dashed border-slate-300 bg-white p-3.5 text-center text-sm font-medium text-brand-dark transition hover:border-brand/50"
          >
            上传新资料
          </Link>
          <Link
            href="/settings/config#knowledge"
            className="block rounded-xl border border-[var(--line)] bg-white p-3.5 text-center text-sm font-medium text-slate-600 transition hover:border-slate-300"
          >
            分类管理
          </Link>
        </div>

        {(docs || []).length === 0 ? (
          <EmptyState text="还没有上传任何资料，先上传门店的项目、话术、活动等资料吧" />
        ) : (
          (docs || []).map((d: any) => (
            <div key={d.id} className="rounded-xl border border-slate-200/70 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/admin/knowledge/${d.id}`} className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">
                    {d.title} <span className="text-xs font-normal text-brand-dark">查看 ›</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {chunkCount[d.id] || 0} 片段 · .{d.file_type} · {fmtDate(d.created_at)}
                  </div>
                </Link>
                <span
                  className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] ${
                    d.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {d.status === "active" ? "启用中" : "已停用"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(d.visible_roles || []).map((r: string) => (
                  <span key={r} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                    {roleLabel(r, labels)}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="shrink-0 text-[11px] text-slate-400">分类：</span>
                {canEdit ? (
                  <>
                    <KnowledgeCategoryEdit docId={d.id} category={d.category} options={categoryOptions} />
                    <span className="text-[10px] text-slate-300">（选一下即转移）</span>
                  </>
                ) : (
                  <span className="text-[11px] text-slate-600">{d.category}</span>
                )}
              </div>
              {d.remark && <p className="mt-2 text-xs text-slate-400">备注：{d.remark}</p>}
              <div className="mt-3 flex gap-4 border-t border-slate-100 pt-2.5">
                <ActionButton
                  action={toggleKnowledgeDoc.bind(null, d.id)}
                  label={d.status === "active" ? "停用" : "启用"}
                  className="text-xs text-slate-500"
                />
                <ActionButton
                  action={deleteKnowledgeDoc.bind(null, d.id)}
                  label="删除"
                  confirmText={`确定删除「${d.title}」？该资料的所有片段会一并删除`}
                  className="text-xs text-red-500"
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
