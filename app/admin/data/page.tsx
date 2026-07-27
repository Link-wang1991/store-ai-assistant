import { redirect } from "next/navigation";
import { BottomNav, MAIN_NAV } from "@/components/BottomNav";
import { StoreDataLifecyclePanel } from "@/components/StoreDataLifecyclePanel";
import { SubpageHeader } from "@/components/SubpageHeader";
import { getAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function StoreDataLifecyclePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.baseRole !== "owner") redirect("/admin");

  return (
    <div className="subpage-shell">
      <SubpageHeader title="数据切换" description="清理测试经营数据前先生成可恢复的本地备份" backHref="/admin" />
      <main className="subpage-content">
        <StoreDataLifecyclePanel />
      </main>
      <BottomNav items={MAIN_NAV} activeHref="/me" />
    </div>
  );
}
