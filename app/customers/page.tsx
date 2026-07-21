"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BottomNav, MAIN_NAV, STAFF_NAV } from "@/components/BottomNav";
import { Brand } from "@/components/Brand";
import { isAdminRole } from "@/lib/constants";
import { customerApi, getToken } from "@/lib/api-client";
import { fmtDate } from "@/lib/format";
import { decodeJwtPayload } from "@/lib/jwt";
import { STAGE_LABEL } from "@/lib/opportunity";
import { AppLoading } from "@/components/AppLoading";

const TABS = [
  { key: "all", label: "全部" }, { key: "today", label: "今日到店" }, { key: "new", label: "新客" },
  { key: "new_deal", label: "新成交" }, { key: "regular", label: "老客" }, { key: "dormant", label: "沉睡" }, { key: "risk", label: "风险" },
];

const POOL_LABEL: Record<string, string> = { today: "今日到店", new: "新客", new_deal: "新成交", regular: "老客", dormant: "沉睡", risk: "风险" };
const POOL_TONE: Record<string, string> = { today: "ref-status-green", new: "ref-status-blue", new_deal: "ref-status-green", regular: "ref-status-blue", dormant: "ref-status-yellow", risk: "ref-status-red" };

function value(c: any, ...keys: string[]) {
  for (const key of keys) if (c?.[key] !== undefined && c?.[key] !== null) return c[key];
  return undefined;
}

function isToday(iso?: string | null) {
  if (!iso) return false;
  const d = new Date(iso); const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function daysAgo(iso?: string | null) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

function effectivePool(c: any): string {
  const pool = value(c, "pool");
  const stage = value(c, "stage");
  const lastVisit = value(c, "last_visit_at", "lastVisitAt");
  const nextFollow = value(c, "next_follow_at", "nextFollowAt");
  const lastActive = value(c, "last_active_at", "lastActiveAt");
  const createdAt = value(c, "created_at", "createdAt");
  if (pool) return pool;
  if (isToday(lastVisit) || isToday(nextFollow)) return "today";
  if (stage === "churn_risk") return "risk";
  if (Math.min(daysAgo(lastActive), daysAgo(lastVisit)) > 30) return "dormant";
  if (stage === "intent") return "new_deal";
  if (stage === "new" && daysAgo(createdAt) <= 7) return "new";
  return "regular";
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<AppLoading label="正在打开客户机会池…" />}>
      <CustomersPageContent />
    </Suspense>
  );
}

function CustomersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPool = searchParams.get("pool");
  const initialPool = TABS.some((tab) => tab.key === requestedPool) ? requestedPool! : "all";
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState(initialPool);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setActiveTab(initialPool);
  }, [initialPool]);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    const payload = decodeJwtPayload(token);
    if (!payload) { router.replace("/login"); return; }

    const nextRole = payload.role || "";
    const employeeId = payload.employeeId || "";
    setRole(nextRole);
    customerApi.list().then((result) => {
      if (!result.ok) return;
      const all = result.data || [];
      const canSeeAll = isAdminRole(nextRole) || nextRole === "admin";
      setCustomers(canSeeAll ? all : all.filter((item: any) => value(item, "assignedTo", "assigned_to") === employeeId));
    }).finally(() => setLoading(false));
  }, [router]);

  const isAdmin = isAdminRole(role) || role === "admin";
  const nav = isAdmin ? MAIN_NAV : STAFF_NAV;
  const customersWithPool = useMemo(() => customers.map((customer) => ({ ...customer, _pool: effectivePool(customer) })), [customers]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = customersWithPool.filter((customer) => {
    const inPool = activeTab === "all" || customer._pool === activeTab;
    const text = [customer.name, customer.phone, customer.ai_suggestion, customer.aiSuggestion, customer.concerns, STAGE_LABEL[customer.stage] || customer.stage].filter(Boolean).join(" ").toLocaleLowerCase();
    return inPool && (!normalizedQuery || text.includes(normalizedQuery));
  });
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: customers.length };
    customersWithPool.forEach((customer) => { counts[customer._pool] = (counts[customer._pool] || 0) + 1; });
    return counts;
  }, [customers.length, customersWithPool]);

  if (loading) return <div className="ref-app flex min-h-screen items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-2 border-[#d7e5d8] border-t-[#006d37]" /></div>;

  return (
    <div className="ref-app ref-customer-page"><div className="ref-canvas">
      <header className="ref-topbar">
        <div className="flex min-w-0 items-center gap-1"><button onClick={() => router.push("/home")} className="ref-icon-button" aria-label="返回首页">←</button><Brand /></div>
        <span className="ref-management-pill">客户机会池</span>
      </header>
      <main className="ref-main">
        <section className="ref-customer-intro"><h1 className="ref-page-title">今天该跟谁</h1><p>按到店、新客、成交培育、老客、沉睡和风险安排今日服务。</p></section>
        <label className="ref-search"><SearchIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、电话或当前需求" aria-label="搜索客户" /></label>
        <div className="ref-customer-tabs" aria-label="客户分组筛选">{TABS.map((tab) => <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`ref-customer-tab ${activeTab === tab.key ? "active" : ""}`}><span>{tab.label}</span><b>{tabCounts[tab.key] || 0}</b></button>)}</div>
        <section className="mt-4 space-y-3">
          {filtered.length === 0 ? <div className="ref-empty">{query ? "没有匹配的客户，换个关键词试试。" : "该分池下还没有客户。"}</div> : filtered.map((customer) => {
            const pool = customer._pool;
            const stage = STAGE_LABEL[customer.stage] || customer.stage || "待跟进";
            const suggestion = value(customer, "ai_suggestion", "aiSuggestion", "concerns");
            const lastVisit = value(customer, "last_visit_at", "lastVisitAt");
            const nextFollow = value(customer, "next_follow_at", "nextFollowAt");
            return <article key={customer.id} className="ref-card ref-customer-list-card"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="ref-work-avatar">{String(customer.name || "客").slice(0, 1)}</span><div className="min-w-0"><h2 className="truncate text-[16px] font-bold text-[#161d17]">{customer.name || "客户"}</h2><p className="mt-1 text-[11px] text-[#6c7b6d]">{customer.phone ? `尾号 ${String(customer.phone).slice(-4)}` : "暂无电话"} · {stage}</p></div></div><span className={`ref-status ${POOL_TONE[pool] || "ref-status-blue"}`}>{POOL_LABEL[pool] || "老客"}</span></div>
              {suggestion && <div className="ref-work-insight mt-3"><SparkIcon /><p>{suggestion}</p></div>}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#6c7b6d]">{lastVisit && <span>最近到店：{fmtDate(lastVisit)}</span>}{nextFollow && <span>下次跟进：{fmtDate(nextFollow)}</span>}</div>
              <div className="mt-4 flex gap-2"><Link href={`/customers/${customer.id}`} className="ref-primary flex-1 px-3">查看 AI 画像</Link><Link href={`/chat?customerId=${customer.id}&new=1`} className="ref-secondary px-3 text-[#006d37]">问 AI 教练</Link></div>
            </article>;
          })}
        </section>
      </main>
      <BottomNav items={nav} />
    </div></div>
  );
}

function SearchIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="11" cy="11" r="7" /><path d="m20 20-4.2-4.2" /></svg>; }
function SparkIcon() { return <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="m12 3 1.5 5.2L19 10l-5.5 1.8L12 17l-1.5-5.2L5 10l5.5-1.8L12 3Z" /></svg>; }
