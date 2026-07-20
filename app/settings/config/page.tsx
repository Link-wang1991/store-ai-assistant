import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { canEnterAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { buildInitialConfig } from "@/lib/config-defaults";
import { ConfigCenter } from "@/components/ConfigCenter";
import { BottomNav, MAIN_NAV } from "@/components/BottomNav";
import { SubpageHeader } from "@/components/SubpageHeader";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!canEnterAdmin(ctx)) redirect("/me");

  // 读已保存配置（表未建/读失败则回退默认，不崩页）
  let saved: any[] = [];
  try {
    saved = await db.config.listByStore(ctx.store.id);
  } catch {
    saved = [];
  }
  const initial = buildInitialConfig(saved);

  return (
    <div className="subpage-shell">
      <SubpageHeader title="自定义配置" description="把池名、阶段、场景、标签改成你们门店的叫法" />
      <main className="subpage-content">
        <ConfigCenter initial={initial} />
      </main>
      <BottomNav items={MAIN_NAV} activeHref="/me" />
    </div>
  );
}
