import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { hasPermission, canEnterAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { BottomNav, MAIN_NAV, STAFF_NAV } from "@/components/BottomNav";
import { SubpageHeader } from "@/components/SubpageHeader";

export const dynamic = "force-dynamic";

export default async function KnowledgeReadPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  // 有管理权限的直接去管理页
  if (canEnterAdmin(ctx)) redirect("/admin/knowledge");
  if (!hasPermission(ctx, "knowledge", "view")) redirect("/work");

  const docs = (await db.knowledge.listDocs(ctx.store.id)) as any[];

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
