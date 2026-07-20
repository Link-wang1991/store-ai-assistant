"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, customerApi, taskApi, meetingApi } from "@/lib/api-client";
import { assignPool, type PoolCustomer } from "@/lib/customer-pools";
import { STAGE_LABEL } from "@/lib/opportunity";
import { fmtDate } from "@/lib/format";
import { BottomNav, type NavItem } from "@/components/BottomNav";
import { Brand } from "@/components/Brand";
import { AppLoading } from "@/components/AppLoading";
import { decodeJwtPayload } from "@/lib/jwt";

const TABS = [
  { key: "tasks", label: "今日优先" },
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
  const [userName, setUserName] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async () => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    const payload = decodeJwtPayload(t);
    if (!payload) { router.replace("/login"); return; }
    setRole(payload.role || "");
    setUserName(payload.name || "同事");
    setLoading(true);

    const [cr, tr, mr] = await Promise.allSettled([customerApi.list(), taskApi.list(), meetingApi.countUnanalyzed()]);
      if (cr.status === "fulfilled" && cr.value.ok) {
        const raw = cr.value.data || [];
        setCusts(raw.map((c: any) => toPoolCustomer(c)));
      }
      if (tr.status === "fulfilled" && tr.value.ok) setTasks(tr.value.data || []);
      if (mr.status === "fulfilled" && mr.value.ok) setReviewCount((mr.value.data as any)?.count ?? 0);
      setLoading(false);
  }, [router]);

  useEffect(() => { void loadData(); }, [loadData]);

  const stats = useMemo(() => {
    const actionable = custs.filter((c) => c.pool !== "regular");
    const priority = actionable.length;
    const followup = tasks.filter((t) => t.status === "todo" || t.status === "overdue").length || actionable.length;
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
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleCustomers = useMemo(() => !normalizedSearch ? filtered : filtered.filter((customer) => [customer.name, customer.stageLabel, customer.concerns, customer.ai_suggestion, customer.importInsight?.aiJudge].filter(Boolean).join(" ").toLocaleLowerCase().includes(normalizedSearch)), [filtered, normalizedSearch]);
  const visibleTasks = useMemo(() => tasks.filter((task) => task.status === "todo" || task.status === "overdue" || task.status === "doing").filter((task) => !normalizedSearch || [task.title, task.content, task.task_type, task.type].filter(Boolean).join(" ").toLocaleLowerCase().includes(normalizedSearch)), [tasks, normalizedSearch]);

  const startTask = async (task: any) => {
    if (task.id) await taskApi.updateStatus(task.id, "doing");
    router.push(`/chat?new=1&q=${encodeURIComponent(task.content || task.title || "请帮我完成这项跟进任务")}`);
  };
  const postponeTask = async (task: any) => {
    if (task.id && task.status === "doing") await taskApi.updateStatus(task.id, "todo");
    setNotice("已保留为待跟进任务，可在稍后继续处理。");
    window.setTimeout(() => setNotice(""), 2600);
    await loadData();
  };

  if (loading) return <AppLoading label="正在准备今日经营概览…" />;

  return (
    <div className="ref-app">
      <div className="ref-canvas">
        <header className="ref-topbar">
          <Brand />
          {(role === "owner" || role === "admin" || role === "manager") ? (
            <Link href="/admin" className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[12px] font-bold text-[#078a4c] transition hover:bg-[#eef8f0]">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63a1.7 1.7 0 0 0 1-1.55V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9a1.7 1.7 0 0 0 1.55 1H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" /></svg>管理
            </Link>
          ) : <span className="ref-icon-button" aria-hidden="true">⌕</span>}
        </header>

        <main className="ref-main">
          <section className="ref-welcome">
            <div className="ref-welcome-copy">
              <p className="ref-welcome-date">{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date())}</p>
              <h2>早上好，{userName}。今天有 <b>{stats.followup}</b> 项跟进、<em>{custs.filter((c) => c.pool === "risk").length}</em> 项风险需要处理</h2>
            </div>
            <Link href="/chat" className="ref-mic-fab" aria-label="向 AI 教练提问">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17v4M8.5 21h7"/></svg>
            </Link>
          </section>
          <label className="ref-search">
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4.2-4.2"/></svg>
            <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" aria-label="搜索客户、会谈、知识库、话术或任务" placeholder="搜索客户、会谈、知识、话术或任务" />
          </label>
          <div className="ref-summary-grid">
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
            href="/customers"
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
            href="/tasks"
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
            href="/customers?pool=today"
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
            href="/meeting"
          />
          </div>

          <section className="mt-7">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="ref-section-title">AI 工作项</h2>
              <div className="flex items-center gap-1 text-[#6f7d73]"><button onClick={() => router.push("/customers")} className="ref-icon-button h-8 w-8" aria-label="查看客户机会池"><CustomersIcon /></button><button onClick={() => void loadData()} className="ref-icon-button h-8 w-8" aria-label="刷新工作项"><RefreshIcon /></button></div>
            </div>
            <div className="ref-work-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              aria-pressed={activeTab === t.key}
              className={`ref-work-tab ${activeTab === t.key ? "active" : ""}`}
            >
              {t.label}
            </button>
          ))}
            </div>
          </section>

          <section className="mt-3 space-y-4">
          {filtered.length === 0 && activeTab !== "tasks" ? (
          <div className="ref-empty">
            暂无数据
          </div>
        ) : activeTab === "tasks" ? (
          <div className="space-y-4">
            {visibleTasks.length === 0 ? (
              visibleCustomers.slice(0, 2).length > 0 ? (
                visibleCustomers.slice(0, 2).map((c) => <SourceCustomerWorkCard key={c.id} c={c} userName={userName} />)
              ) : (
                <HomeEmptyState onCreate={() => router.push("/chat?new=1")} />
              )
            ) : (
              visibleTasks.slice(0, 8).map((t) => (
                <TaskInboxCard key={t.id} task={t} userName={userName} onStart={startTask} onPostpone={postponeTask} />
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {visibleCustomers.slice(0, 8).map((c) => (
              <SourceCustomerWorkCard key={c.id} c={c} userName={userName} />
            ))}
          </div>
        )}
          </section>
        </main>
      </div>
      {notice && <div role="status" className="ref-toast">{notice}</div>}

      <button className="ref-contextual-fab" onClick={() => router.push("/chat?new=1")} aria-label="新建 AI 工作项">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      <BottomNav items={navItems} />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "green" | "orange" | "blue" | "purple";
  href?: string;
}) {
  const className = `ref-bento ref-summary-card ref-summary-${tone === "orange" ? "gold" : tone}`;
  const content = <>
    <div className="ref-summary-head"><span className="ref-summary-icon">{icon}</span><span className="ref-summary-label">{label}</span></div>
    <div><div className="ref-summary-value">{value}</div><div className="ref-summary-note">{sub}</div></div>
  </>;

  if (href) {
    return <Link href={href} className={className} aria-label={`查看${label}，当前${value}`}>{content}</Link>;
  }

  return (
    <div className={className}>{content}</div>
  );
}

function TaskInboxCard({ task, userName, onStart, onPostpone }: { task: any; userName: string; onStart: (task: any) => void | Promise<void>; onPostpone: (task: any) => void | Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const taskType = task.task_type || task.type || "跟进";
  const dueAt = task.deadline || task.dueAt || task.due_at;
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

  const risk = tone === "danger";
  const detail = task.content || "这项经营动作需要在今天完成，避免影响后续服务闭环。";
  return (
    <article className="ref-bento ref-work-card ref-card-lift">
      <div className="ref-work-card-head">
        <div className="flex min-w-0 items-center gap-3"><div className="ref-work-avatar">{initial}</div><div className="min-w-0"><h3 className="truncate text-[16px] font-bold tracking-tight text-[#161d17]">{task.title || "待处理任务"}</h3><p className="mt-1 truncate text-[11px] text-[#6c7b6d]">{taskType}{dueAt ? ` · 截止 ${String(dueAt).slice(0, 10)}` : " · AI 已生成建议"}</p></div></div>
        <span className={`ref-status ${risk ? "ref-status-red" : "ref-status-green"}`}>{risk ? "风险预警" : "AI 洞察"}</span>
      </div>
      <div className="mt-4"><p className="ref-eyebrow mb-1.5">核心结论</p><div className={`ref-work-insight ${risk ? "risk" : ""}`}><SparkIcon /><p>{risk ? "需要优先介入，确认事实与客户感受后再给出处理承诺。" : detail}</p></div></div>
      <button onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className={`ref-work-action mt-3 ${risk ? "risk" : ""}`}>查看 AI 研判详情 <WorkChevron open={expanded} /></button>
      {expanded && <div className="ref-task-detail"><b>执行提示</b><p>{risk ? "先确认客户事实与感受，再由负责人作出明确处理承诺。" : "完成沟通后，在 AI 教练中记录客户反馈，系统会继续生成下一步建议。"}</p></div>}
      <div className="ref-divider my-4" />
      <div className="grid grid-cols-2 gap-3 text-[11px]"><div><p className="text-[#6c7b6d]">负责人</p><p className="mt-1 font-semibold text-[#161d17]">{userName}（本人）</p></div><div><p className="text-[#6c7b6d]">建议时间</p><p className="mt-1 font-semibold text-[#161d17]">{dueAt ? String(dueAt).slice(5, 10) : "今日 14:00–16:00"}</p></div></div>
      <div className={`ref-work-script mt-4 ${risk ? "risk" : ""}`}>“{detail}”</div>
      <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void onStart(task)} className="ref-primary flex-1 px-3">开始执行</button><button onClick={() => void onPostpone(task)} className="ref-secondary px-3">稍后提醒</button></div>
    </article>
  );
}

function SourceCustomerWorkCard({ c, userName }: { c: PoolCustomer; userName: string }) {
  const risk = c.pool === "risk";
  const importSummary = typeof c.importInsight === "string"
    ? c.importInsight
    : c.importInsight?.aiJudge || "";
  return (
    <Link href={`/customers/${c.id}`} className="ref-bento ref-work-card ref-card-lift block">
      <div className="ref-work-card-head"><div className="flex min-w-0 items-center gap-3"><div className="ref-work-avatar">{c.name.slice(0, 1)}</div><div className="min-w-0"><h3 className="truncate text-[16px] font-bold text-[#161d17]">{c.name}</h3><p className="mt-1 truncate text-[11px] text-[#6c7b6d]">{c.stageLabel || "待跟进客户"} · {c.lastActive || "等待联系"}</p></div></div><span className={`ref-status ${risk ? "ref-status-red" : "ref-status-green"}`}>{risk ? "风险预警" : "AI 洞察"}</span></div>
      <div className="mt-4"><p className="ref-eyebrow mb-1.5">核心结论</p><div className={`ref-work-insight ${risk ? "risk" : ""}`}><SparkIcon /><p>{c.ai_suggestion || (risk ? "需要主动确认顾虑并提供修复方案，避免意向持续下降。" : c.concerns || importSummary || "适合以客户当前需求切入，先完成一次低门槛沟通。")}</p></div></div>
      <span className={`ref-work-action mt-3 ${risk ? "risk" : ""}`}>查看 AI 研判详情 <WorkChevron /></span>
      <div className="ref-divider my-4" />
      <div className="grid grid-cols-2 gap-3 text-[11px]"><div><p className="text-[#6c7b6d]">负责人</p><p className="mt-1 font-semibold text-[#161d17]">{userName}（本人）</p></div><div><p className="text-[#6c7b6d]">建议时间</p><p className="mt-1 font-semibold text-[#161d17]">{c.nextFollowLabel || "今日 14:00–16:00"}</p></div></div>
      <div className={`ref-work-script mt-4 ${risk ? "risk" : ""}`}>“{c.ai_suggestion || "您好，想跟您确认一下最近的安排。我们已结合您的情况准备了一个更合适的建议，方便时我为您说明。"}”</div>
      <div className="mt-4 flex gap-2"><span className="ref-primary flex-1">查看客户并跟进</span><span className="ref-secondary px-3">详情</span></div>
    </Link>
  );
}

function HomeEmptyState({ onCreate }: { onCreate: () => void }) {
  return <article className="ref-card p-5 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#e4f5e8] text-[#006d37]"><SparkIcon /></span><h3 className="mt-3 text-[14px] font-bold text-[#161d17]">暂时没有待处理工作项</h3><p className="mt-1 text-[12px] leading-relaxed text-[#6c7b6d]">发起一次 AI 咨询或会谈后，后续动作会自动沉淀在这里。</p><button onClick={onCreate} className="ref-secondary mt-4 px-4 text-[#006d37]">新建 AI 咨询</button></article>;
}

function SparkIcon() {
  return <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-current" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="m12 3 1.5 5.2L19 10l-5.5 1.8L12 17l-1.5-5.2L5 10l5.5-1.8L12 3Z" /></svg>;
}
function WorkChevron({ open = false }: { open?: boolean }) { return <svg viewBox="0 0 24 24" className={`ml-1 inline-block h-3.5 w-3.5 align-[-2px] transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>; }
function CustomersIcon() { return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M17 5.5a3 3 0 0 1 0 5.7M17.5 14.2a5 5 0 0 1 3 4.7" /></svg>; }
function RefreshIcon() { return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 5v5h-5" /></svg>; }
