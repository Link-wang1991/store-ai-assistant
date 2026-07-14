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
import { decodeJwtPayload } from "@/lib/jwt";

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
    const payload = decodeJwtPayload(t);
    if (!payload) { router.replace("/login"); return; }
    setRole(payload.role || "");

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
    <div className="home-inbox min-h-screen pb-[calc(94px+var(--safe-bottom))]">
      <div className="home-inbox-frame">
        {/* Inbox 头部 */}
        <header className="home-inbox-header">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="home-app-logo" aria-hidden="true">H</div>
              <div className="min-w-0">
                <h1 className="truncate text-[20px] font-bold leading-tight text-[#111827]">门店 AI Inbox</h1>
                <p className="mt-1 truncate text-[12px] text-[#8b95a5]">咨询成交模板 · 护理/销售/回访</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center">
            {(role === "owner" || role === "admin" || role === "manager") && (
              <Link
                href="/admin"
                className="home-manage-button"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63a1.7 1.7 0 0 0 1-1.55V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9a1.7 1.7 0 0 0 1.55 1H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
                </svg>
                管理
              </Link>
            )}
          </div>
          </div>

          {/* 搜索 */}
          <div className="home-global-search">
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[#98a2b3]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              aria-label="搜索客户、会谈、知识库、话术"
              placeholder="搜索客户、会谈、知识库、话术"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-slate-700 outline-none placeholder:text-[#a3acb9]"
            />
          </div>
        </header>

        <main className="home-inbox-content">
        {/* 统计卡 */}
        <div className="home-overview-grid">
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
            tone="green"
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
            tone="orange"
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
            tone="blue"
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
            tone="purple"
          />
        </div>

        {/* 标签切换 */}
        <div className="home-segment-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              aria-pressed={activeTab === t.key}
              className={`home-segment-tab ${activeTab === t.key ? "active" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 今日 AI 工作台 */}
        <div className="home-workbench-title">
          <h2 className="flex items-center gap-1.5">
            今日 AI 工作台
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#1aa474]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="m12 3 1.25 3.75L17 8l-3.75 1.25L12 13l-1.25-3.75L7 8l3.75-1.25L12 3Z" />
              <path d="m18.5 14 .75 2.25L21.5 17l-2.25.75L18.5 20l-.75-2.25L15.5 17l2.25-.75L18.5 14Z" />
            </svg>
          </h2>
          <span className="flex items-center gap-1 text-[11px] text-[#98a2b3]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
            按经营价值排序
          </span>
        </div>

        {filtered.length === 0 && activeTab !== "tasks" ? (
          <div className="home-empty-state">
            暂无数据
          </div>
        ) : activeTab === "tasks" ? (
          <div className="space-y-3">
            {tasks.length === 0 ? (
              <div className="home-empty-state">
                暂无任务
              </div>
            ) : (
              tasks.filter((t) => t.status === "todo").slice(0, 10).map((t) => (
                <TaskInboxCard key={t.id} task={t} />
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
        </main>
      </div>

      <BottomNav items={navItems} variant="home" />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "green" | "orange" | "blue" | "purple";
}) {
  return (
    <div className={`home-overview-card home-overview-${tone}`}>
      <div className="flex items-center gap-2.5">
        <span className="home-overview-icon">{icon}</span>
        <span className="truncate text-[13px] font-semibold text-[#374151]">{label}</span>
      </div>
      <div className="mt-3 text-[26px] font-bold leading-none tracking-tight text-[#111827]">{value}</div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="truncate text-[12px] text-[#98a2b3]">{sub}</span>
        <span className="home-overview-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </span>
      </div>
    </div>
  );
}

function TaskInboxCard({ task }: { task: any }) {
  const taskType = task.task_type || "跟进";
  const taskText = `${task.title || ""} ${task.content || ""} ${taskType}`;
  const tone = /风险|客诉|投诉|异常|退款|争议|签约|报价/.test(taskText)
    ? "danger"
    : /复盘|培训|知识/.test(taskText)
      ? "purple"
      : /活动|唤醒|复购|意向|成交/.test(taskText)
        ? "warn"
        : "green";
  const customerInitial = String(task.title || "").match(/([\u4e00-\u9fff])(?:姐|女士|阿姨|先生|总)/)?.[1];
  const initial = customerInitial || String(taskType).trim().slice(0, 1) || "任";

  return (
    <article className={`home-task-card home-task-${tone}`}>
      <div className="home-task-main">
        <div className="home-task-avatar" aria-hidden="true">{initial}</div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold text-[#111827]">{task.title}</h3>
          <div className="mt-1.5 flex min-w-0 items-center gap-2">
            <span className="home-task-tag">{taskType}</span>
            {task.deadline && <time className="truncate text-[11px] text-[#98a2b3]">截止 {task.deadline.slice(0, 10)}</time>}
          </div>
        </div>
        <span className="home-task-enter" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </span>
      </div>

      {task.content && (
        <div className="home-ai-suggestion">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="m12 3 1.25 3.75L17 8l-3.75 1.25L12 13l-1.25-3.75L7 8l3.75-1.25L12 3Z" />
            <path d="m18.5 14 .75 2.25L21.5 17l-2.25.75L18.5 20l-.75-2.25L15.5 17l2.25-.75L18.5 14Z" />
          </svg>
          <p className="line-clamp-2"><span className="font-medium">建议：</span>{task.content}</p>
        </div>
      )}
    </article>
  );
}