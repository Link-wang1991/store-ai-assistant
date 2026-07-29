import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { hasPermission, canEnterAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { BottomNav, MAIN_NAV, STAFF_NAV } from "@/components/BottomNav";
import { SubpageHeader } from "@/components/SubpageHeader";

export const dynamic = "force-dynamic";

export default async function KnowledgeReadPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  const { source } = await searchParams;
  // 有管理权限的直接去管理页
  if (canEnterAdmin(ctx)) redirect(source ? `/admin/knowledge/${encodeURIComponent(source)}` : "/admin/knowledge");
  if (!hasPermission(ctx, "knowledge", "view")) redirect("/work");

  // 员工只能阅读当前启用且明确对其角色可见的资料。来源链接命中已停用/撤回资料时，
  // 保留“历史快照仍在会谈/AI 回答里”的提示，但不泄露原文。
  const docs = ((await db.knowledge.listDocs(ctx.store.id)) as any[]).filter((doc) =>
    doc.status === "active" && (!Array.isArray(doc.visible_roles) || doc.visible_roles.length === 0 || doc.visible_roles.includes(ctx.employee.role)),
  );
  const selected = source ? docs.find((doc) => doc.id === source) : null;
  const selectedChunks = selected ? (await db.knowledge.getChunksByDoc(selected.id, ctx.store.id)) as any[] : [];

  // 按分类分组
  const byCat: Record<string, any[]> = {};
  for (const d of docs || []) {
    const c = d.category || "其他";
    (byCat[c] = byCat[c] || []).push(d);
  }
  const cats = Object.keys(byCat);

  return (
    <div className="subpage-shell">
      <SubpageHeader title="门店知识库" description="遇到问题先查这里，也是 AI 回答的依据" />

      <main className="subpage-content space-y-4">
        {source && (
          selected ? (
            <section className="rounded-2xl border border-[var(--green-light)] bg-[var(--green-soft)]/45 p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold tracking-wide text-[var(--green-dark)]">AI / 会谈引用的原资料</p><h2 className="mt-1 text-[16px] font-bold text-[var(--ink)]">{selected.title || "未命名资料"}</h2><p className="mt-1 text-[11px] text-[var(--muted)]">{selected.category || "未分类"} · 当前启用中</p></div><Link href="/knowledge" className="shrink-0 text-[11px] text-[var(--green-dark)] underline underline-offset-2">返回列表</Link></div>
              {selected.summary && <p className="mt-3 text-[12px] leading-relaxed text-[var(--muted)]">{selected.summary}</p>}
              <div className="mt-3 space-y-2 border-t border-[var(--green-light)] pt-3">
                {selectedChunks.length > 0 ? selectedChunks.map((chunk, index) => <div key={chunk.id || index} className="rounded-xl border border-[var(--line)] bg-white p-3"><p className="text-[10px] font-medium text-[var(--faint)]">{chunk.title || `资料片段 ${index + 1}`}</p><p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--muted)]">{chunk.content}</p></div>) : <p className="text-[12px] text-[var(--faint)]">该资料没有可展示的文字片段。</p>}
              </div>
            </section>
          ) : <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">该来源资料已停用、已撤回或当前角色无权查看。历史回答/会谈中的引用快照仍保留，用于说明当时的分析依据。</div>
        )}
        {cats.length === 0 ? (
          <div className="ui-empty-state">
            门店还没有上传知识资料
          </div>
        ) : (
          cats.map((cat) => (
            <section key={cat}>
              <div className="subpage-section-label">{cat}</div>
              <div className="subpage-list-card">
                {byCat[cat].map((d) => (
                  <div key={d.id} className="subpage-list-row">
                    <div className="text-sm font-medium text-[var(--ink)]">{d.title || "未命名资料"}</div>
                    {d.summary && <div className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">{d.summary}</div>}
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </main>
      <BottomNav items={canEnterAdmin(ctx) ? MAIN_NAV : STAFF_NAV} activeHref="/me" />
    </div>
  );
}
