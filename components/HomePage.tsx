"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, customerApi, taskApi, meetingApi } from "@/lib/api-client";
import { assignPool, type PoolCustomer } from "@/lib/customer-pools";
import { STAGE_LABEL } from "@/lib/opportunity";
import { fmtDate } from "@/lib/format";
import { WorkCard } from "@/components/WorkCard";
import { BottomNav, type NavItem } from "@/components/BottomNav";

const TABS = [
  { key: "tasks", label: "今日重点" },
  { key: "high", label: "高价值" },
  { key: "risk", label: "风险" },
];

function field(c: any, ...names: string[]) {
  for (const n of names) {
    const v = c[n];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function toPoolCustomer(raw: any): PoolCustomer {
  const nowMs = Date.now();
  const c = raw;
  const stage = field(c, "stage") || "";
  const lastVisitAt = field(c, "last_visit_at", "lastVisitAt");
  const lastDealAt = field(c, "last_deal_at", "lastDealAt");
  const nextFollowAt = field(c, "next_follow_at", "nextFollowAt");
  const updatedAt = field(c, "updated_at", "updatedAt");
  const lastActiveAt = field(c, "last_active_at", "lastActiveAt");
  const importRaw = field(c, "import_raw", "importRaw");
  return {
    id: c.id,
    name: c.name || "客户",
    stage,
    stageLabel: STAGE_LABEL[stage] || stage,
    assigneeLabel: "",
    lastActive: fmtDate(updatedAt || lastActiveAt),
    ownerVisible: true,
    concerns: field(c, "concerns"),
    ai_suggestion: field(c, "ai_suggestion", "aiSuggestion"),
    importInsight: importRaw?.insight || null,
    pool: assignPool({ ...c, last_visit_at: lastVisitAt, last_deal_at: lastDealAt, next_follow_at: nextFollowAt, stage }),
    lastVisitDays: lastVisitAt ? Math.floor((nowMs - new Date(lastVisitAt).getTime()) / 86400000) : null,
    nextFollowLabel: nextFollowAt ? fmtDate(nextFollowAt) : null,
    lastVisitDate: lastVisitAt ? fmtDate(lastVisitAt) : null,
  };
}

function isFollowToday(nextFollowLabel?: string | null): boolean {
  if (!nextFollowLabel) return false;
  const today = fmtDate(new Date().toISOString());
  return nextFollowLabel === today;
}

export default function HomePage({ navItems }: { navItems: NavItem[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const [storeName, setStoreName] = useState("");
  const [userName, setUserName] = useState("");
  const [activeTab, setActiveTab] = useState("tasks");
  const [custs, setCusts] = useState<PoolCustomer[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [reviewCount, setReviewCount] = useState(0);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    try {
      const raw = t.split(".")[1];
      const utf8 = decodeURIComponent(escape(atob(raw)));
      const p = JSON.parse(utf8);
      const r = p.role || "";
      setRole(r);
      setStoreName(p.storeName || "");
      setUserName(p.name || "");
    } catch {
      router.replace("/login");
      return;
    }

    Promise.allSettled([customerApi.list(), taskApi.list(), meetingApi.countUnanalyzed()]).then(([cr, tr, mr]) => {
      if (cr.status === "fulfilled" && cr.value.ok) {
        const raw = cr.value.data || [];
        setCusts(raw.map((c: any) => toPoolCustomer(c)));
      }
      if (tr.status === "fulfilled" && tr.value.ok) setTasks(tr.value.data || []);
      if (mr.status === "fulfilled" && mr.value.ok) setReviewCount((mr.value.data as any)?.count ?? 0);
      setLoading(false);
    });
  }, [router]);

  const stats = useMemo(() => {
    const priority = custs.filter((c) => c.pool === "risk" || c.pool === "today").length;
    const followup = custs.filter((c) => isFollowToday(c.nextFollowLabel)).length;
    const todayVisit = custs.filter((c) => c.pool === "today").length;
    return {
      priority: priority || 0,
      followup: followup || tasks.filter((t) => t.status === "todo").length || 0,
      todayVisit: todayVisit || 0,
      review: reviewCount,
    };
  }, [custs, tasks, reviewCount]);

  const filtered = useMemo(() => {
    if (activeTab === "tasks") {
      return custs
        .filter((c) => c.pool !== "regular")
        .sort((a, b) => {
          const priority: Record<string, number> = { risk: 5, today: 4, new_deal: 3, dormant: 2, new: 1, regular: 0 };
          return (priority[b.pool] || 0) - (priority[a.pool] || 0);
        });
    }
    if (activeTab === "high") {
      return custs.filter((c) => c.pool === "new_deal" || c.pool === "regular");
    }
    return custs.filter((c) => c.pool === "risk");
  }, [custs, activeTab]);

  if (loading) return <div className="flex h-screen items-center justify-center text-sm text-slate-400">加载中…</div>;

  return (
    <div className="min-h-screen bg-[var(--page)] pb-20">
      {/* Inbox 头部 */}
      <header className="bg-white px-4 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--green-dark)] text-lg font-bold text-white">
              {(userName || "H")[0]}
            </div>
            <div>
              <div className="text-[16px] font-semibold text-slate-900">{storeName || "门店 AI Inbox"}</div>
              <div className="text-[11px] text-[var(--muted)]">{userName || "员工"}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(role === "owner" || role === "admin" || role === "manager") && (
              <Link
                href="/admin"
                className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
                管理
              </Link>
            )}
          </div>
        </div>

        {/* 搜索 */}
        <div className="mt-3">
          <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2.5">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-[var(--faint)]" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="搜索客户、会谈、知识库、话术"
              className="flex-1 bg-transparent text-[13px] text-slate-700 outline-none placeholder:text-[var(--faint)]"
            />
          </div>
        </div>
      </header>

      <div className="p-4">
        {/* 统计卡 */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <StatCard
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            }
            label="今日重点客户"
            value={`${stats.priority} 位`}
            sub="需要优先处理"
            color="text-emerald-600"
          />
          <StatCard
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            }
            label="今日待跟进"
            value={`${stats.followup} 个`}
            sub="动作待完成"
            color="text-amber-600"
          />
          <StatCard
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            }
            label="今日到店客户"
            value={`${stats.todayVisit} 位`}
            sub="需服务闭环"
            color="text-sky-600"
          />
          <StatCard
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            }
            label="待复盘会谈"
            value={`${stats.review} 条`}
            sub="可沉淀经验"
            color="text-purple-600"
          />
        </div>

        {/* 标签切换 */}
        <div className="hm-tabs mb-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`hm-tab ${activeTab === t.key ? "active" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 今日 AI 工作台 */}
        <div className="hm-section-title">
          <h3>今日 AI 工作台</h3>
          <button className="flex items-center gap-1 text-[var(--faint)]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
            按经营价值排序
          </button>
        </div>

        {filtered.length === 0 && activeTab !== "tasks" ? (
          <div className="rounded-2xl border border-[var(--line)] bg-white p-8 text-center text-sm text-slate-400">
            暂无数据
          </div>
        ) : activeTab === "tasks" ? (
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <div className="rounded-2xl border border-[var(--line)] bg-white p-8 text-center text-sm text-slate-400">
                暂无任务
              </div>
            ) : (
              tasks.filter((t) => t.status === "todo").slice(0, 10).map((t) => (
                <div key={t.id} className="rounded-2xl border border-[var(--line)] bg-white p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium text-[var(--ink)] truncate">{t.title}</div>
                      {t.content && <div className="mt-1 text-[12px] text-[var(--muted)] line-clamp-2">{t.content}</div>}
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[var(--faint)]">
                        <span className="rounded-md bg-[var(--yellow-soft)] px-1.5 py-0.5 text-[10px] text-[var(--yellow)]">
                          {t.task_type || "跟进"}
                        </span>
                        {t.deadline && <span>截止 {t.deadline?.slice(0, 10)}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.slice(0, 8).map((c) => (
              <WorkCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </div>

      <BottomNav items={navItems} />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-3.5">
      <div className="flex items-center gap-2">
        <span className={`${color}`}>{icon}</span>
        <span className="text-[12px] font-medium text-slate-700">{label}</span>
      </div>
      <div className="mt-2 text-[20px] font-bold text-slate-900">{value}</div>
      <div className="text-[11px] text-[var(--faint)]">{sub}</div>
    </div>
  );
}
