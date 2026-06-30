import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { canEnterAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { ImportWizard } from "@/components/ImportWizard";
import { BottomNav, MAIN_NAV } from "@/components/BottomNav";

export const dynamic = "force-dynamic";

export default async function CustomerImportPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!canEnterAdmin(ctx)) redirect("/customers");

  const emps = ((await db.employees.listByStore(ctx.store.id)) as any[]) || [];
  const employees = emps
    .filter((e) => e.status !== "disabled")
    .map((e) => ({ id: e.id as string, name: e.name as string }));

  return (
    <div className="min-h-screen pb-16">
      <header className="border-b border-[var(--line)] bg-white px-4 py-4">
        <Link href="/me" className="text-[11px] text-[var(--green-dark)]">‹ 我的</Link>
        <div className="mt-1 text-[18px] font-semibold tracking-tight text-slate-900">客户批量导入</div>
        <div className="mt-0.5 text-xs text-slate-500">上传表格，AI 识别表头、清洗去重、自动分池</div>
      </header>
      <div className="p-4">
        <ImportWizard employees={employees} />
      </div>
      <BottomNav items={MAIN_NAV} />
    </div>
  );
}
