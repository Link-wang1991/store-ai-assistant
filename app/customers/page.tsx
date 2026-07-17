"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BottomNav, MAIN_NAV, STAFF_NAV } from "@/components/BottomNav";
import { isAdminRole } from "@/lib/constants";
import { getToken } from "@/lib/api-client";
import { API_BASE_URL } from "@/lib/data-source";
import { fmtDate } from "@/lib/format";
import { decodeJwtPayload } from "@/lib/jwt";

const TABS = [
  { key: "all", label: "全部" },
  { key: "today", label: "今日到店" },
  { key: "new", label: "新客" },
  { key: "new_deal", label: "新成交" },
  { key: "regular", label: "老客" },
  { key: "dormant", label: "沉睡" },
  { key: "risk", label: "风险" },
];

const POOL_LABEL: Record<string, string> = {
  today: "今日到店",
  new: "新客",
  new_deal: "新成交",
  regular: "老客",
  dormant: "沉睡",
  risk: "风险",
};

const POOL_COLOR: Record<string, string> = {
  today: "bg-[var(--green-soft)] text-[var(--green-dark)]",
  new: "bg-sky-50 text-sky-600",
  new_deal: "bg-[var(--green)] text-white",
  regular: "bg-slate-100 text-slate-500",
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

/** 计算客户当前所属池（优先用后端 pool 字段，未分类时按业务规则回退） */
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

export default function CustomersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    const t = getToken();
    if (!t) { router.replace("/login"); return; }

    let employeeId = "";
    const p = decodeJwtPayload(t);
    if (!p) { router.replace("/login"); return; }
    setRole(p.role || "");
    employeeId = p.employeeId || "";

    if (!employeeId) { setLoading(false); return; }

    fetch(`${API_BASE_URL}/api/proxy/customers?assigned_to=eq.${employeeId}&limit=200`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then(res => res.json())
      .then(j => {
        if (j.code === 200 && Array.isArray(j.data)) {
          setCustomers(j.data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  const isAdmin = isAdminRole(role);
  const nav = isAdmin ? MAIN_NAV : STAFF_NAV;

  const customersWithPool = customers.map((c) => ({ ...c, _pool: effectivePool(c) }));
  const filtered = activeTab === "all"
    ? customersWithPool
    : customersWithPool.filter((c) => c._pool === activeTab);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: customers.length };
    for (const c of customersWithPool) counts[c._pool] = (counts[c._pool] || 0) + 1;
    return counts;
  }, [customersWithPool, customers.length]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--page)]">
        <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--green)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--page)] pb-20">
      {/* 顶部栏 */}
      <div className="sticky top-0 z-30 border-b border-[var(--line)] bg-white px-4 py-3">
        <div className="relative flex items-center justify-center">
          <button
            onClick={() => router.push("/home")}
            className="absolute left-0 flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[15px] font-bold text-[var(--ink)] transition hover:bg-[var(--line)]"
          >
            ←
          </button>
          <div className="text-center">
            <div className="text-[15px] font-semibold text-[var(--ink)]">客户机会池</div>
            <div className="text-[11px] text-[var(--faint)]">今天该跟谁 · 到店/新客/成交/老客/沉睡/风险</div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="text-[12px] leading-relaxed text-[var(--muted)]">
          不是通讯录，是今天该跟谁。客户按到店、新客、成交培育、老客、沉睡、风险分池。
        </div>
      </div>

      {/* 分池筛选 */}
      <div className="mt-3 px-4">
        <div className="grid grid-cols-4 gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`rounded-xl border py-2.5 transition ${
                activeTab === t.key
                  ? "border-[var(--green)] bg-[var(--green-soft)]"
                  : "border-[var(--line)] bg-[var(--page)]"
              }`}
            >
              <div className={`text-lg font-semibold ${activeTab === t.key ? "text-[var(--green-dark)]" : "text-[var(--ink)]"}`}>
                {tabCounts[t.key] ?? 0}
              </div>
              <div className={`mt-0.5 text-[10px] ${activeTab === t.key ? "text-[var(--green-dark)]" : "text-[var(--faint)]"}`}>
                {t.label}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 客户列表 */}
      <div className="px-4 pt-2">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-white p-8 text-center text-[13px] text-[var(--faint)]">
            该分池下还没有客户。
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((c) => {
              const pool = c._pool;
              return (
                <div key={c.id} className="rounded-2xl border border-[var(--line)] bg-white p-4">
                  {/* 标题行 */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--green-soft)] text-[14px] font-medium text-[var(--green-dark)]">
                        {(c.name || "客")[0]}
                      </span>
                      <div>
                        <div className="text-[14px] font-semibold text-[var(--ink)]">{c.name || "客户"}</div>
                        <div className="text-[11px] text-[var(--faint)]">{c.phone || "暂无电话"}</div>
                      </div>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${POOL_COLOR[pool] || POOL_COLOR.regular}`}>
                      {POOL_LABEL[pool] || "老客"}
                    </span>
                  </div>

                  {/* AI 建议 */}
                  {(c.ai_suggestion || c.concerns) && (
                    <div className="mt-3 rounded-xl bg-[var(--green-soft)]/30 p-3">
                      <div className="mb-1 text-[11px] font-medium text-[var(--green-dark)]">AI 建议</div>
                      <div className="text-[12px] leading-relaxed text-[var(--muted)]">
                        {c.ai_suggestion || c.concerns}
                      </div>
                    </div>
                  )}

                  {/* 信息行 */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--faint)]">
                    {c.last_visit_at && <span>最近到店：{fmtDate(c.last_visit_at)}</span>}
                    {c.next_follow_at && <span>下次跟进：{fmtDate(c.next_follow_at)}</span>}
                    <span>阶段：{c.stage || "未设置"}</span>
                  </div>

                  {/* 操作按钮 */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/customers/${c.id}`}
                      className="rounded-full bg-[var(--green)] px-4 py-1.5 text-center text-[12px] font-medium text-white"
                    >
                      查看 AI 画像
                    </Link>
                    <Link
                      href={`/chat?customerId=${c.id}&new=1`}
                      className="rounded-full border border-[var(--green)] bg-[var(--green-soft)] px-4 py-1.5 text-center text-[12px] font-medium text-[var(--green-dark)]"
                    >
                      问 AI 教练
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav items={nav} />
    </div>
  );
}
