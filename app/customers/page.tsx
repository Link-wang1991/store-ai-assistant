import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { canEnterAdmin, getDataScope } from "@/lib/permissions";
import { STAGE_LABEL } from "@/lib/opportunity";
import { assignPool } from "@/lib/customer-pools";
import { getStoreLabels } from "@/lib/store-labels";
import { CustomerPools, type PoolCustomer } from "@/components/CustomerPools";
import { BottomNav, MAIN_NAV, STAFF_NAV } from "@/components/BottomNav";
import { fmtDate, fmtTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: { pool?: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const isAdmin = canEnterAdmin(ctx);
  // 员工只看自己负责的客户（data_scope=self），店长/老板看全店
  const scope = getDataScope(ctx, "customers");
  const [raw, employees] = await Promise.all([
    scope === "self"
      ? (db.customers.listByAssignee(ctx.store.id, ctx.employee.id) as Promise<any[]>)
      : (db.customers.listByStore(ctx.store.id) as Promise<any[]>),
    db.employees.listByStore(ctx.store.id) as Promise<any[]>,
  ]);

  const empName = new Map((employees || []).map((e) => [e.id, e.name]));
  const nowMs = Date.now();

  const customers: PoolCustomer[] = raw.map((c) => ({
    id: c.id,
    name: c.name || "客户",
    stage: c.stage,
    stageLabel: STAGE_LABEL[c.stage] || c.stage,
    assigneeLabel: c.assigned_to ? empName.get(c.assigned_to) || "未分配" : "未分配",
    lastActive: fmtTime(c.updated_at),
    ownerVisible: true,
    concerns: c.concerns,
    ai_suggestion: c.ai_suggestion,
    importInsight: c.import_raw?.insight || null,
    pool: assignPool(c),
    lastVisitDays: c.last_visit_at ? Math.floor((nowMs - new Date(c.last_visit_at).getTime()) / 86400000) : null,
    nextFollowLabel: c.next_follow_at ? fmtDate(c.next_follow_at) : null,
  }));

  const nav = isAdmin ? MAIN_NAV : STAFF_NAV;
  const storeLabels = await getStoreLabels(ctx.store.id);

  return (
    <div className="min-h-screen pb-16">
      <header className="flex items-center justify-between border-b border-[var(--line)] bg-white px-4 py-4">
        <div>
          <div className="text-[18px] font-semibold tracking-tight text-slate-900">AI 客户机会池</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {isAdmin ? "全店客户" : "我负责的客户"} · 今天每位该怎么对待，AI 已分好
          </div>
        </div>
        {isAdmin && (
          <Link href="/admin/customers" className="shrink-0 text-xs text-[var(--green-dark)]">
            全部客户 →
          </Link>
        )}
      </header>

      <div className="p-4">
        {customers.length === 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white p-8 text-center text-sm text-slate-400">
            还没有客户记录。可在「我的 → 客户批量导入」一次性导入，或在会谈/跟进中自动建档。
          </div>
        ) : (
          <CustomerPools customers={customers} initialPool={searchParams?.pool} poolLabels={storeLabels.pool} />
        )}
      </div>
      <BottomNav items={nav} />
    </div>
  );
}
