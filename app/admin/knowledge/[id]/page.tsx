import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { roleLabel } from "@/lib/roles";
import { ROLES } from "@/lib/constants";
import { ActionForm } from "@/components/ActionForm";
import { updateKnowledgeRoles } from "@/lib/actions";
import { PageHeader, Card } from "@/components/ui";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const IMG_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];

export default async function KnowledgeDetailPage({ params }: { params: { id: string } }) {
  const ctx = (await getAuthContext())!;
  if (!hasPermission(ctx, "knowledge", "view")) redirect("/admin");

  const doc: any = await db.knowledge.getDoc(params.id);
  if (!doc || doc.store_id !== ctx.store.id) notFound();

  const chunks = (await db.knowledge.getChunksByDoc(params.id, ctx.store.id)) as any[];
  const labels = ctx.roleLabels;

  const roleDefs = await db.roles.listActiveDefinitions(ctx.store.id);
  const roleOptions =
    roleDefs.length > 0
      ? roleDefs.map((r: any) => ({ key: r.role_key, name: r.display_name }))
      : ROLES.map((r) => ({ key: r, name: roleLabel(r, labels) }));
  const canEdit = hasPermission(ctx, "knowledge", "edit");
  const currentRoles: string[] = doc.visible_roles || [];

  return (
    <div>
      <PageHeader title={doc.title} subtitle={`${doc.category} · .${doc.file_type} · ${fmtDate(doc.created_at)}`} />
      <div className="space-y-3 p-4">
        {/* 文档信息 */}
        <Card>
          <div className="flex items-center justify-between">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                doc.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
              }`}
            >
              {doc.status === "active" ? "启用中" : "已停用"}
            </span>
            <span className="text-xs text-slate-400">{chunks.length} 个知识片段</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {(doc.visible_roles || []).map((r: string) => (
              <span key={r} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                {roleLabel(r, labels)}
              </span>
            ))}
          </div>
          {doc.remark && <p className="mt-2 text-xs text-slate-400">备注：{doc.remark}</p>}
          <div className="mt-3 border-t border-slate-50 pt-2">
            <Link href="/admin/knowledge" className="text-xs text-brand-dark">← 返回知识库</Link>
          </div>
        </Card>

        {/* 编辑可见角色：谁能在 AI 对话里检索到这条资料 */}
        {canEdit && (
          <Card>
            <div className="mb-1 text-sm font-semibold text-slate-700">👁 可见角色</div>
            <p className="mb-2 text-xs text-slate-400">只有勾选的角色，在 AI 对话里才能检索到这条资料。改了立即生效。</p>
            <ActionForm action={updateKnowledgeRoles} submitText="保存可见角色" className="space-y-2">
              <input type="hidden" name="id" value={doc.id} />
              <div className="grid grid-cols-3 gap-2">
                {roleOptions.map((r) => (
                  <label key={r.key} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                    <input type="checkbox" name="visible_roles" value={r.key} defaultChecked={currentRoles.includes(r.key)} />
                    {r.name}
                  </label>
                ))}
              </div>
            </ActionForm>
          </Card>
        )}

        {/* 原文件（图片直接显示，其它给查看链接）*/}
        {doc.file_url ? (
          <Card>
            <div className="mb-2 text-sm font-semibold text-slate-700">📎 原文件</div>
            {IMG_EXTS.includes((doc.file_type || "").toLowerCase()) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={doc.file_url} alt={doc.title} className="w-full rounded-lg border border-slate-100" />
            ) : (
              <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-sm text-brand-dark">
                在新窗口打开原文件 ›
              </a>
            )}
          </Card>
        ) : (
          <Card>
            <p className="text-xs text-slate-400">
              此资料只入库了提取的文字，未保存原文件，因此看不到图片/原件。如需在知识库里看到图片，请管理员开启文件存储后重新上传（见下方说明）。
            </p>
          </Card>
        )}

        {/* 内容预览（按片段展示）*/}
        <h2 className="px-1 text-sm font-semibold text-slate-700">内容预览（提取的文字）</h2>
        {chunks.length === 0 ? (
          <Card><p className="text-sm text-slate-400">该资料没有可显示的片段（可能解析为空）。</p></Card>
        ) : (
          chunks.map((c, i) => (
            <Card key={c.id}>
              {c.title && <div className="mb-1 text-xs font-medium text-slate-500">{c.title}</div>}
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{c.content}</div>
              <div className="mt-2 text-right text-[10px] text-slate-300">片段 {i + 1}/{chunks.length}</div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
