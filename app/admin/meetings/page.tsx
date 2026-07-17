import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminBackHeader } from "@/components/AdminBackHeader";
import { AdminMeetingManager } from "@/components/AdminMeetingManager";

export const dynamic = "force-dynamic";

export default async function AdminMeetingsPage() {
  const ctx = (await getAuthContext())!;
  const storeId = ctx.store.id;

  const [analyses, openOpps, employees, meetings, customers] = await Promise.all([
    db.meetingAnalysis.listByStore(storeId, 100),
    db.opportunities.listOpen(storeId, 50),
    db.employees.listActiveByStore(storeId),
    db.meetings.listByStore(storeId, 100),
    db.customers.listByStore(storeId),
  ]);

  return (
    <div>
      <AdminBackHeader
        title="会谈复盘"
        subtitle="全店会谈洞察：机会、员工短板、体验风险、未成交原因"
      />
      <AdminMeetingManager
        analyses={analyses as any[]}
        meetings={meetings as any[]}
        employees={(employees as any[]).map((e) => ({ id: e.id, name: e.name }))}
        openOpps={openOpps as any[]}
        customers={customers as any[]}
      />
    </div>
  );
}
