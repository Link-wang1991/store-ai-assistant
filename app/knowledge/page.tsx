import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { hasPermission, canEnterAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { BottomNav, MAIN_NAV, STAFF_NAV } from "@/components/BottomNav";

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
    <div className="min-h-screen pb-16">
      <header className="border-b border-[var(--line)] bg-white px-4 py-4">
        <Link href="/me" className="text-[11px] text-[var(--green-dark)]">‹ 我的</Link>
        <div className="mt-1 text-[18px] font-semibold tracking-tight text-slate-900">门店知识库</div>
        <div className="mt-0.5 text-xs text-slate-500">遇到问题先查这里，也是 AI 回答的依据</div>
      </header>

      <div className="space-y-4 p-4">
        {cats.length === 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white p-8 text-center text-sm text-slate-400">
            门店还没有上传知识资料
          </div>
        ) : (
          cats.map((cat) => (
            <section key={cat}>
              <div className="mb-2 px-0.5 text-[13px] font-semibold text-slate-800">{cat}</div>
              <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
                {byCat[cat].map((d) => (
                  <div key={d.id} className="border-b border-slate-50 px-4 py-3 last:border-0">
                    <div className="text-sm text-slate-800">{d.title || "未命名资料"}</div>
                    {d.summary && <div className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">{d.summary}</div>}
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
      <BottomNav items={canEnterAdmin(ctx) ? MAIN_NAV : STAFF_NAV} />
    </div>
  );
}
