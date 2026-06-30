import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { canEnterAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { buildInitialConfig } from "@/lib/config-defaults";
import { ConfigCenter } from "@/components/ConfigCenter";
import { BottomNav, MAIN_NAV } from "@/components/BottomNav";

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
    <div className="min-h-screen pb-16">
      <header className="border-b border-[var(--line)] bg-white px-4 py-4">
        <Link href="/me" className="text-[11px] text-[var(--green-dark)]">‹ 我的</Link>
        <div className="mt-1 text-[18px] font-semibold tracking-tight text-slate-900">自定义配置</div>
        <div className="mt-0.5 text-xs text-slate-500">把池名、阶段、场景、标签等改成你们门店的叫法</div>
      </header>
      <div className="p-4">
        <ConfigCenter initial={initial} />
      </div>
      <BottomNav items={MAIN_NAV} />
    </div>
  );
}
