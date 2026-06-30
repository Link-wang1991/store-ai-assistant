import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, SectionHeader } from "@/components/ui";
import { CustomerBulkManager } from "@/components/CustomerBulkManager";
import { ReorganizeButton } from "@/components/ReorganizeButton";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  new: "新客咨询",
  intent: "意向",
  deal: "已成交",
  regular: "老客",
  churn_risk: "流失风险",
};
export default async function CustomersPage({ searchParams }: { searchParams: { filter?: string } }) {
  const ctx = (await getAuthContext())!;
  const [allCusts, emps] = await Promise.all([
    db.customers.listByStore(ctx.store.id) as Promise<any[]>,
    db.employees.listByStore(ctx.store.id) as Promise<any[]>,
  ]);
  const employees = (emps || []).filter((e) => e.status !== "disabled").map((e) => ({ id: e.id, name: e.name }));
  const empName = new Map((emps || []).map((e) => [e.id, e.name]));
  const onlyUnassigned = searchParams?.filter === "unassigned";
  const custs = onlyUnassigned ? allCusts.filter((c) => !c.assigned_to) : allCusts;
  const unassignedCount = allCusts.filter((c) => !c.assigned_to).length;

  const counts: Record<string, number> = {};
  for (const c of allCusts) counts[c.stage] = (counts[c.stage] || 0) + 1;

  return (
    <div>
      <PageHeader
        title={onlyUnassigned ? "待分配客户" : "全部客户"}
        subtitle={onlyUnassigned ? `${custs.length} 位待分配负责人` : `共 ${allCusts.length} 位客户 · 机会视角见「客户」机会池`}
      />
      {!onlyUnassigned && (
        <div className="space-y-2 px-4 pt-3">
          <Link
            href="/customers/import"
            className="flex items-center justify-between rounded-xl border border-brand/40 bg-brand/5 px-3 py-2.5 text-sm font-medium text-brand-dark"
          >
            <span>⬆ 批量导入客户（CSV / Excel / Word 名单）</span>
            <span>›</span>
          </Link>
          <ReorganizeButton />
          {unassignedCount > 0 && (
            <Link
              href="/admin/customers?filter=unassigned"
              className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"
            >
              <span><b>{unassignedCount} 位</b>客户还没有负责人</span>
              <span>去分配 ›</span>
            </Link>
          )}
        </div>
      )}
      <div className="space-y-5 p-4">
        {/* 客户分层 */}
        <section>
          <SectionHeader title="客户分层" />
          <div className="grid grid-cols-5 gap-2 text-center">
            {["new", "intent", "deal", "regular", "churn_risk"].map((s) => (
              <div key={s} className="rounded-xl border border-slate-200/70 bg-white py-2.5">
                <div className="text-lg font-semibold text-slate-900">{counts[s] || 0}</div>
                <div className="mt-0.5 text-[10px] text-slate-500">{STAGE_LABEL[s]}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 客户列表 */}
        <section>
          <SectionHeader title="客户列表" />
          {custs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
              <p className="text-sm text-slate-500">还没有客户记录。</p>
              <p className="mt-1 text-xs text-slate-400">
                客户名单要从这里导入（不是知识库——知识库只存话术/SOP）。导入后才会按到店日期自动分池、触发提醒。
              </p>
              <Link
                href="/customers/import"
                className="mt-3 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
              >
                ⬆ 批量导入客户
              </Link>
            </div>
          ) : (
            <CustomerBulkManager
              customers={custs.map((c) => ({
                id: c.id,
                name: c.name,
                stage: c.stage,
                phone: c.phone,
                notes: c.notes,
                concerns: c.concerns,
                assigned_to: c.assigned_to,
                assigneeName: c.assigned_to ? empName.get(c.assigned_to) || null : null,
              }))}
              employees={employees}
            />
          )}
        </section>
      </div>
    </div>
  );
}
