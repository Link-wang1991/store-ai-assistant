"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, customerApi, taskApi, knowledgeApi } from "@/lib/api-client";

export default function AdminHome() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [custs, setCusts] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [role, setRole] = useState("");

  useEffect(() => {
    const t = getToken();
    if (!t) { router.replace("/login"); return; }
    try {
      const p = JSON.parse(atob(t.split(".")[1]));
      if (p.role !== "owner" && p.role !== "manager") { router.replace("/work"); return; }
      setRole(p.role);
    } catch { router.replace("/login"); return; }

    Promise.all([
      customerApi.list(),
      taskApi.list(),
    ]).then(([cr, tr]) => {
      if (cr.ok) setCusts(cr.data || []);
      if (tr.ok) setTasks(tr.data || []);
    }).catch(() => setError("数据加载失败"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div className="flex h-screen items-center justify-center text-sm text-slate-400">加载中…</div>;

  const intentCount = custs.filter(c => c.stage === "intent").length;
  const dormantCount = custs.filter(c => c.pool === "dormant").length;
  const todoTasks = tasks.filter(t => t.status === "todo").length;
  const unassignedCount = custs.filter(c => !c.assignedTo).length;

  return (
    <div>
      <header className="border-b border-slate-200/70 bg-white px-4 py-4">
        <div className="text-[11px] text-slate-400">今日增长作战室</div>
        <div className="mt-0.5 text-[18px] font-semibold tracking-tight text-slate-900">门店 AI 经营助手</div>
        <div className="text-xs text-slate-500">经营大脑</div>
      </header>

      <div className="space-y-3 p-4">
        {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-500">{error}</div>}

        {unassignedCount > 0 && (
          <Link href="/admin/customers" className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="text-sm text-amber-700">
              <b>{unassignedCount} 位客户待分配负责人</b>
              <div className="mt-0.5 text-[11px] text-amber-600/80">没人负责就不会被跟进</div>
            </div>
            <span className="text-amber-500">›</span>
          </Link>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <Link href="/customers" className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
            <b className="block text-sm text-slate-800">高意向客户</b>
            {intentCount} 位可推进成交
          </Link>
          <Link href="/customers" className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
            <b className="block text-sm text-slate-800">待唤醒老客</b>
            {dormantCount} 位久未到店
          </Link>
          <Link href="/admin/tasks" className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
            <b className="block text-sm text-slate-800">待跟进</b>
            {todoTasks} 个动作待完成
          </Link>
          <Link href="/admin/risks" className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
            <b className="block text-sm text-slate-800">客户体验风险</b>
            查看详情
          </Link>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[
            { href: "/admin/customers", icon: "◎", label: "客户" },
            { href: "/admin/meetings", icon: "◉", label: "会谈复盘" },
            { href: "/admin/tasks", icon: "✓", label: "增长动作" },
            { href: "/admin/reports", icon: "↗", label: "增长复盘" },
            { href: "/admin/knowledge", icon: "▤", label: "知识库" },
            { href: "/admin/announcements", icon: "▣", label: "通知" },
            { href: "/admin/employees", icon: "◍", label: "员工" },
            { href: "/admin/chats", icon: "❝", label: "提问记录" },
          ].map(l => (
            <Link key={l.href} href={l.href} className="flex flex-col items-center rounded-xl border border-slate-200 bg-white py-3 text-center">
              <span className="text-base">{l.icon}</span>
              <span className="mt-1 text-[11px] text-slate-500">{l.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
