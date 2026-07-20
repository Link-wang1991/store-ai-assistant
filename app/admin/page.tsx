"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { customerApi, getToken, knowledgeApi, meetingApi, taskApi } from "@/lib/api-client";
import { decodeJwtPayload } from "@/lib/jwt";
import { BottomNav, MAIN_NAV } from "@/components/BottomNav";
import { AccountIcon, Brand } from "@/components/Brand";

const ADMIN_ICONS: Record<string, React.ReactNode> = {
  customers: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  knowledge: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
  ),
  meetings: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
  tasks: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  employees: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
    </svg>
  ),
  reports: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  risks: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  chats: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  announcements: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  roles: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

const ADMIN_LINKS = [
  { key: "customers", href: "/admin/customers", label: "客户管理" },
  { key: "knowledge", href: "/admin/knowledge", label: "知识库" },
  { key: "meetings", href: "/admin/meetings", label: "会谈复盘" },
  { key: "tasks", href: "/admin/tasks", label: "增长动作" },
  { key: "employees", href: "/admin/employees", label: "员工管理" },
  { key: "reports", href: "/admin/reports", label: "增长复盘" },
  { key: "risks", href: "/admin/risks", label: "风险管理" },
  { key: "chats", href: "/admin/chats", label: "提问记录" },
  { key: "announcements", href: "/admin/announcements", label: "通知管理" },
  { key: "roles", href: "/admin/roles", label: "权限管理" },
];

function field(item: any, ...keys: string[]) { for (const key of keys) if (item?.[key] !== undefined && item?.[key] !== null) return item[key]; return undefined; }
function isToday(value?: string | null) { if (!value) return false; const date = new Date(value); const now = new Date(); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate(); }
function percent(numerator: number, denominator: number) { return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0; }

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState({ customers: [] as any[], tasks: [] as any[], meetings: [] as any[], knowledge: [] as any[] });

  useEffect(() => {
    const t = getToken();
    if (!t) { router.replace("/login"); return; }
    const p = decodeJwtPayload(t);
    if (!p) { router.replace("/login"); return; }
    const r = p.role || "";
    if (r !== "owner" && r !== "manager" && r !== "admin") { router.replace("/home"); return; }
    Promise.allSettled([customerApi.list(), taskApi.list(), meetingApi.list(), knowledgeApi.list()]).then(([customers, tasks, meetings, knowledge]) => {
      setSnapshot({
        customers: customers.status === "fulfilled" && customers.value.ok ? customers.value.data || [] : [],
        tasks: tasks.status === "fulfilled" && tasks.value.ok ? tasks.value.data || [] : [],
        meetings: meetings.status === "fulfilled" && meetings.value.ok ? meetings.value.data || [] : [],
        knowledge: knowledge.status === "fulfilled" && knowledge.value.ok ? knowledge.value.data || [] : [],
      });
      setLoading(false);
    });
  }, [router]);

  const dashboard = useMemo(() => {
    const riskCustomers = snapshot.customers.filter((customer) => field(customer, "stage") === "churn_risk" || field(customer, "pool") === "risk");
    const unassigned = snapshot.customers.filter((customer) => !field(customer, "assignedTo", "assigned_to"));
    const pendingTasks = snapshot.tasks.filter((task) => !["done", "canceled"].includes(field(task, "status") || "todo"));
    const completedTasks = snapshot.tasks.filter((task) => field(task, "status") === "done");
    const todayVisits = snapshot.customers.filter((customer) => isToday(field(customer, "last_visit_at", "lastVisitAt")));
    const highValue = snapshot.customers.filter((customer) => ["intent", "new_deal"].includes(field(customer, "stage") || ""));
    const knowledgeGaps = snapshot.knowledge.filter((document) => ["inactive", "pending", "review"].includes(field(document, "status") || ""));
    const unfinishedMeetings = snapshot.meetings.filter((meeting) => !["done", "failed"].includes(field(meeting, "status") || ""));
    return {
      exceptions: [
        { label: "高风险待处理", category: "高风险", count: riskCustomers.length, detail: riskCustomers.length ? "存在需要优先复核的风险客户" : "暂无风险客户需要处理", href: "/admin/risks", tone: "risk", action: "处理" },
        { label: "知识缺口待补", category: "培训", count: knowledgeGaps.length, detail: knowledgeGaps.length ? "有知识资料等待补充或审核" : "知识库状态正常", href: "/admin/knowledge/gaps", tone: "warn", action: "查看" },
        { label: "身份/归属待确认", category: "核实", count: unassigned.length, detail: unassigned.length ? "有客户尚未分配负责人" : "客户归属已确认", href: "/admin/customers", tone: "info", action: "核实" },
        { label: "待完成增长动作", category: "逾期", count: pendingTasks.length, detail: pendingTasks.length ? "待办动作会持续出现在员工工作台" : "暂无待完成动作", href: "/admin/tasks", tone: "ok", action: "跟进" },
      ],
      metrics: [
        { label: "今日到店覆盖率", value: `${percent(todayVisits.length, snapshot.customers.length)}%`, width: `${percent(todayVisits.length, snapshot.customers.length)}%`, tone: "green" },
        { label: "跟进完成率", value: `${percent(completedTasks.length, snapshot.tasks.length)}%`, width: `${percent(completedTasks.length, snapshot.tasks.length)}%`, tone: "blue" },
        { label: "高价值客户推进", value: `${highValue.length} / ${snapshot.customers.length}`, width: `${percent(highValue.length, snapshot.customers.length)}%`, tone: "purple" },
      ],
      knowledgeGaps: knowledgeGaps.length,
      unfinishedMeetings: unfinishedMeetings.length,
    };
  }, [snapshot]);

  if (loading) return <div className="ref-app flex h-screen items-center justify-center text-sm text-[#6c7b6d]">正在汇总经营数据…</div>;

  return (
    <div className="ref-app ref-admin-page">
      <div className="ref-canvas">
      <header className="ref-topbar">
        <div className="flex min-w-0 items-center gap-1"><Link href="/me" className="ref-icon-button" aria-label="返回">←</Link><Brand /></div>
        <div className="flex items-center gap-3"><span className="hidden text-[11px] font-medium text-[#718077] md:inline">门店助手 · 店长模式</span><span className="ref-customer-account"><AccountIcon /></span></div>
      </header>

      <main className="ref-profile">
        <section>
          <div className="mb-4 flex items-center justify-between"><h1 className="ref-page-title">待处理异常</h1><Link href="/admin/pending" className="text-[12px] font-bold text-[#078a4c]">查看所有日志 ↗</Link></div>
          <div className="space-y-2.5">
            {dashboard.exceptions.map((item) => (
              <article key={item.label} className={`admin-exception admin-${item.tone}`}>
                <span className="admin-exception-icon"><ExceptionIcon tone={item.tone} /></span>
                <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className={`admin-category admin-category-${item.tone}`}>{item.category}</span><h2>{item.label}</h2><span className="admin-count">{item.count}</span></div><p>{item.detail}</p></div>
                <Link href={item.href} className="admin-action">{item.action}</Link>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-9">
          <h2 className="mb-5 text-[22px] font-bold tracking-tight text-[#172119]">经营模块</h2>
          <div className="grid gap-4"><div className="ref-card p-5"><div className="mb-6 flex items-center justify-between"><div><h3 className="font-bold text-[#263128]">经营核心指标</h3><p className="mt-0.5 text-[11px] text-[#718077]">实时业务进度监控</p></div><Link href="/admin/reports" className="ref-primary min-h-[32px] px-3 text-[11px]">详情</Link></div>
            {dashboard.metrics.map((metric) => <div key={metric.label} className="mb-4 last:mb-0"><div className="mb-2 flex justify-between text-[13px] font-semibold"><span>{metric.label}</span><span>{metric.value}</span></div><div className="admin-meter"><i className={`admin-meter-${metric.tone}`} style={{ width: metric.width }} /></div></div>)}
          </div><Link href="/admin/knowledge" className="ref-card ref-card-lift flex items-center gap-3 p-5"><span className="grid h-11 w-11 place-items-center rounded-full bg-[#eaf7ee] text-[#078a4c]">↻</span><span className="min-w-0 flex-1"><b className="block text-[14px] text-[#263128]">知识库待同步</b><small className="mt-1 block text-[11px] text-[#718077]">{dashboard.knowledgeGaps ? `${dashboard.knowledgeGaps} 项资料等待处理` : dashboard.unfinishedMeetings ? `${dashboard.unfinishedMeetings} 场会谈正在沉淀经验` : "当前没有待同步资料"}</small></span><span className="text-[#078a4c]">›</span></Link></div>
        </section>

        <section className="mt-8 pb-3">
          <h2 className="mb-4 text-[20px] font-bold tracking-tight text-[#172119]">管理入口</h2>
          <div className="grid gap-3">
          {ADMIN_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="ref-card ref-card-lift flex min-h-[64px] items-center gap-3 rounded-xl p-3.5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f1f6f2] text-[#657269]">
                {ADMIN_ICONS[l.key]}
              </span>
              <span className="text-[14px] font-semibold text-[#263128]">{l.label}</span><span className="ml-auto text-[#b4beb6]">›</span>
            </Link>
          ))}
          </div>
        </section>
      </main>
      <BottomNav items={MAIN_NAV} activeHref="/me" />
      </div>
    </div>
  );
}

function ExceptionIcon({ tone }: { tone: string }) {
  const common = { viewBox: "0 0 24 24", className: "h-5 w-5", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (tone === "risk") return <svg {...common}><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v4M12 16h.01" /></svg>;
  if (tone === "warn") return <svg {...common}><path d="M4 5h16v13H7l-3 3V5Z" /><path d="M9.5 9.5a2.5 2.5 0 1 1 4.3 1.7c-.9.7-1.8 1.1-1.8 2.3M12 15.5h.01" /></svg>;
  if (tone === "info") return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 11v5M12 8h.01" /></svg>;
  return <svg {...common}><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 5v5h-5" /></svg>;
}
