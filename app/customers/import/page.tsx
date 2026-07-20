import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { canEnterAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { ImportWizard } from "@/components/ImportWizard";
import { BottomNav, MAIN_NAV } from "@/components/BottomNav";
import { SubpageHeader } from "@/components/SubpageHeader";

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
    <div className="subpage-shell">
      <SubpageHeader title="客户批量导入" description="上传表格，AI 识别表头、清洗去重、自动分池" backHref="/customers" />
      <main className="subpage-content">
        <ImportWizard employees={employees} />
      </main>
      <BottomNav items={MAIN_NAV} />
    </div>
  );
}
