"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CustomerBulkManager, type BulkCust } from "@/components/CustomerBulkManager";
import { ReorganizeButton } from "@/components/ReorganizeButton";

const STAGE_LABEL: Record<string, string> = {
  new: "新客咨询", intent: "意向", deal: "已成交", regular: "老客", churn_risk: "流失风险",
};

const POOL_TABS = [
  { key: "all", label: "全部" },
  { key: "today", label: "今日到店" },
  { key: "new", label: "新客" },
  { key: "new_deal", label: "新成交" },
  { key: "regular", label: "老客" },
  { key: "dormant", label: "沉睡" },
  { key: "risk", label: "风险" },
  { key: "unassigned", label: "待分配" },
];

const POOL_LABEL: Record<string, string> = {
  today: "今日到店", new: "新客", new_deal: "新成交", regular: "老客", dormant: "沉睡", risk: "风险",
};

const POOL_COLOR: Record<string, string> = {
  today: "bg-[var(--green-soft)] text-[var(--green-dark)]",
  new: "bg-sky-50 text-sky-600",
  new_deal: "bg-[var(--green)] text-white",
  regular: "bg-[var(--surface-2)] text-[var(--faint)]",
  dormant: "bg-[var(--surface-2)] text-[var(--faint)]",
  risk: "bg-[var(--red-soft)] text-[var(--red)]",
};

function isToday(iso?: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function daysAgo(iso?: string | null) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

function effectivePool(c: any): string {
  if (c.pool) return c.pool;
  if (isToday(c.last_visit_at) || isToday(c.next_follow_at)) return "today";
  if (c.stage === "churn_risk") return "risk";
  const inactiveDays = Math.min(daysAgo(c.last_active_at), daysAgo(c.last_visit_at));
  if (inactiveDays > 30) return "dormant";
  if (c.stage === "intent") return "new_deal";
  if (c.stage === "new" && daysAgo(c.created_at) <= 7) return "new";
  if (c.stage === "regular") return "regular";
  return "regular";
}

export function AdminCustomerManager({
  customers,
  employees,
}: {
  customers: any[];
  employees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("all");

  const enriched = useMemo(() => {
    return customers.map((c) => ({ ...c, _pool: effectivePool(c) }));
  }, [customers]);

  const filtered = useMemo(() => {
    if (activeTab === "all") return enriched;
    if (activeTab === "unassigned") return enriched.filter((c) => !c.assigned_to);
    return enriched.filter((c) => c._pool === activeTab);
  }, [enriched, activeTab]);

  const poolCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of enriched) {
      const p = c._pool;
      counts[p] = (counts[p] || 0) + 1;
    }
    counts.unassigned = enriched.filter((c) => !c.assigned_to).length;
    return counts;
  }, [enriched]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of customers) counts[c.stage] = (counts[c.stage] || 0) + 1;
    return counts;
  }, [customers]);

  const unassignedCount = poolCounts.unassigned || 0;

  const bulkCustomers: BulkCust[] = filtered.map((c) => ({
    id: c.id,
    name: c.name,
    stage: c.stage,
    phone: c.phone,
    notes: c.notes,
    concerns: c.concerns,
    assigned_to: c.assigned_to,
    assigneeName: c.assigned_to ? employees.find((e) => e.id === c.assigned_to)?.name || null : null,
    pool: c._pool,
    last_visit_at: c.last_visit_at,
    next_follow_at: c.next_follow_at,
  }));

  return (
    <div className="min-h-screen bg-[var(--page)] pb-20">
      {/* 顶部栏 */}
      <div className="sticky top-0 z-30 border-b border-[var(--line)] bg-white px-4 py-3">
        <div className="relative flex items-center justify-center">
          <button
            onClick={() => router.push("/admin")}
            className="absolute left-0 flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[15px] font-bold text-[var(--ink)] transition hover:bg-[var(--line)]"
          >
            ←
          </button>
          <div className="text-center">
            <div className="text-[15px] font-semibold text-[var(--ink)]">客户管理</div>
            <div className="text-[11px] text-[var(--faint)]">共 {customers.length} 位客户 · 分配/分池/导入</div>
          </div>
        </div>
      </div>

      {/* 快捷操作 */}
      <div className="space-y-2 px-4 pt-3">
        <Link
          href="/customers/import"
          className="flex items-center justify-between rounded-2xl border border-[var(--green)]/40 bg-[var(--green-soft)]/50 px-4 py-3 text-[13px] font-medium text-[var(--green-dark)]"
        >
          <span>批量导入客户（CSV / Excel / Word 名单）</span>
          <span>›</span>
        </Link>
        <ReorganizeButton />
        {unassignedCount > 0 && (
          <button
            onClick={() => setActiveTab("unassigned")}
            className="flex w-full items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-700"
          >
            <span><b>{unassignedCount} 位</b>客户还没有负责人</span>
            <span>去分配 ›</span>
          </button>
        )}
      </div>

      {/* 客户分池 */}
      <section className="mx-4 mt-4 rounded-2xl border border-[var(--line)] bg-white p-4">
        <div className="mb-3 text-[15px] font-semibold text-[var(--ink)]">客户分池</div>
        <div className="grid grid-cols-4 gap-2 text-center">
          {["today", "new", "new_deal", "regular", "dormant", "risk", "unassigned"].map((s) => (
            <button
              key={s}
              onClick={() => setActiveTab(s)}
              className={`rounded-xl border py-2.5 transition ${
                activeTab === s
                  ? "border-[var(--green)] bg-[var(--green-soft)]"
                  : "border-[var(--line)] bg-[var(--page)]"
              }`}
            >
              <div className={`text-lg font-semibold ${activeTab === s ? "text-[var(--green-dark)]" : "text-[var(--ink)]"}`}>
                {poolCounts[s] || 0}
              </div>
              <div className={`mt-0.5 text-[10px] ${activeTab === s ? "text-[var(--green-dark)]" : "text-[var(--faint)]"}`}>
                {POOL_LABEL[s] || "待分配"}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* 客户分层（按阶段） */}
      <section className="mx-4 mt-4 rounded-2xl border border-[var(--line)] bg-white p-4">
        <div className="mb-3 text-[15px] font-semibold text-[var(--ink)]">客户分层</div>
        <div className="grid grid-cols-5 gap-2 text-center">
          {["new", "intent", "deal", "regular", "churn_risk"].map((s) => (
            <div key={s} className="rounded-xl border border-[var(--line)] bg-[var(--page)] py-2.5">
              <div className="text-lg font-semibold text-[var(--ink)]">{stageCounts[s] || 0}</div>
              <div className="mt-0.5 text-[10px] text-[var(--faint)]">{STAGE_LABEL[s]}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 客户列表 */}
      <section className="mx-4 mt-4">
        <div className="mb-2 flex items-center justify-between px-0.5">
          <div className="text-[15px] font-semibold text-[var(--ink)]">客户列表</div>
          <div className="text-[11px] text-[var(--faint)]">{filtered.length} 位</div>
        </div>

        {/* 池筛选标签（横向） */}
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {POOL_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] transition ${
                activeTab === t.key
                  ? "bg-[var(--green)] text-white"
                  : "border border-[var(--line)] bg-white text-[var(--muted)]"
              }`}
            >
              {t.label} ({t.key === "all" ? customers.length : poolCounts[t.key] || 0})
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white p-6 text-center">
            <p className="text-[13px] text-[var(--faint)]">该条件下还没有客户。</p>
            <Link
              href="/customers/import"
              className="mt-3 inline-block rounded-full bg-[var(--green)] px-4 py-2 text-[12px] font-medium text-white"
            >
              批量导入客户
            </Link>
          </div>
        ) : (
          <CustomerBulkManager customers={bulkCustomers} employees={employees} />
        )}
      </section>
    </div>
  );
}
