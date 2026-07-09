"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BottomNav, MAIN_NAV, STAFF_NAV } from "@/components/BottomNav";
import { isAdminRole } from "@/lib/constants";
import { getToken } from "@/lib/api-client";
import { API_BASE_URL } from "@/lib/data-source";
import { fmtDate } from "@/lib/format";

const TABS = [
  { key: "all", label: "全部" },
  { key: "today", label: "今日到店" },
  { key: "new", label: "新客" },
  { key: "deal", label: "新成交" },
  { key: "old", label: "老客" },
  { key: "sleep", label: "沉睡" },
  { key: "risk", label: "风险" },
];

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
    try {
      const raw = t.split(".")[1];
      const utf8 = decodeURIComponent(escape(atob(raw)));
      const p = JSON.parse(utf8);
      setRole(p.role || "");
      employeeId = p.employeeId || "";
    } catch { router.replace("/login"); return; }

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

  const filtered = activeTab === "all" ? customers : customers.filter((c) => {
    if (activeTab === "new") return c.stage === "new";
    if (activeTab === "deal") return c.stage === "deal";
    if (activeTab === "old") return c.stage === "old";
    if (activeTab === "sleep") return c.stage === "sleep";
    if (activeTab === "risk") return c.stage === "risk";
    return true;
  });

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--page)]">
        <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--green)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--page)] pb-20">
      {/* 顶部绿色品牌栏 */}
      <div className="bg-[var(--green)] px-4 pb-4 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-white font-bold text-[13px]">H</div>
            <div>
              <div className="text-[15px] font-semibold text-white">门店 AI Inbox</div>
              <div className="text-[11px] text-white/70">老板经营模板 · 管理/客诉/运营</div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="text-[16px] font-semibold text-[var(--ink)]">客户机会池</div>
        <div className="mt-1 text-[12px] text-[var(--muted)]">
          不是通讯录，是今天该跟谁。客户按到店、新客、成交培育、老客、沉睡、风险分池。
        </div>
      </div>

      {/* Tab 筛选 */}
      <div className="mt-3 px-4">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] transition ${
                activeTab === t.key
                  ? "bg-[var(--green)] text-white"
                  : "border border-[var(--line)] bg-white text-[var(--muted)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 客户列表 */}
      <div className="px-4 pt-2">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-white p-8 text-center text-[13px] text-[var(--faint)]">
            还没有客户记录。可在会谈中自动建档或导入客户。
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((c) => (
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
                  <span className="rounded-full bg-[var(--green-soft)] px-2.5 py-0.5 text-[10px] font-medium text-[var(--green-dark)]">
                    {c.stage || "新客"}
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
                <div className="mt-3 flex items-center gap-4 text-[11px] text-[var(--faint)]">
                  {c.last_visit_at && <span>最近到店：{fmtDate(c.last_visit_at)}</span>}
                  {c.next_follow_at && <span>下次跟进：{fmtDate(c.next_follow_at)}</span>}
                </div>

                {/* 操作按钮 */}
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/customers/${c.id}`}
                    className="rounded-full bg-[var(--green)] px-4 py-1.5 text-center text-[12px] font-medium text-white"
                  >
                    查看 AI 画像
                  </Link>
                  <Link
                    href={`/meeting?customer=${c.id}`}
                    className="rounded-full border border-[var(--line)] px-4 py-1.5 text-center text-[12px] text-[var(--muted)]"
                  >
                    会谈复盘
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav items={nav} />
    </div>
  );
}
