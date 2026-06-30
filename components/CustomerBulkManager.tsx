"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkAssignCustomers, bulkDeleteCustomers, deleteCustomer, reassignCustomerOwners, bulkSetLastVisit } from "@/lib/actions";
import { CustomerAssign } from "@/components/CustomerAssign";

const STAGE_LABEL: Record<string, string> = {
  new: "新客咨询", intent: "意向", deal: "已成交", regular: "老客", churn_risk: "流失风险",
};
const STAGE_COLOR: Record<string, string> = {
  new: "bg-sky-50 text-sky-600", intent: "bg-emerald-50 text-emerald-600", deal: "bg-brand/10 text-brand-dark",
  regular: "bg-slate-100 text-slate-500", churn_risk: "bg-amber-50 text-amber-600",
};

export type BulkCust = {
  id: string; name: string; stage: string; phone?: string | null; notes?: string | null;
  concerns?: string | null; assigned_to?: string | null; assigneeName?: string | null;
};

export function CustomerBulkManager({
  customers,
  employees,
}: {
  customers: BulkCust[];
  employees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [bulkOwner, setBulkOwner] = useState("");
  const [bulkDate, setBulkDate] = useState("");

  const toggle = (id: string) =>
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = customers.length > 0 && sel.size === customers.length;
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(customers.map((c) => c.id)));

  const doBulkAssign = () => {
    if (!bulkOwner) { window.alert("请先选择要分配的负责人"); return; }
    start(async () => {
      const r = await bulkAssignCustomers(Array.from(sel), bulkOwner);
      if (!r.ok) window.alert(r.message || "分配失败");
      setSel(new Set()); setBulkOwner(""); router.refresh();
    });
  };
  const doBulkDelete = () => {
    if (!window.confirm(`确定删除选中的 ${sel.size} 位客户？档案不可恢复。`)) return;
    start(async () => {
      const r = await bulkDeleteCustomers(Array.from(sel));
      if (!r.ok) window.alert(r.message || "删除失败");
      setSel(new Set()); router.refresh();
    });
  };
  const doDelete = (id: string, name: string) => {
    if (!window.confirm(`确定删除客户「${name}」？档案不可恢复。`)) return;
    start(async () => {
      const r = await deleteCustomer(id);
      if (!r.ok) window.alert(r.message || "删除失败");
      router.refresh();
    });
  };
  const doReassign = () => {
    start(async () => {
      const r = await reassignCustomerOwners(Array.from(sel));
      window.alert(r.message || (r.ok ? "已重新识别" : "操作失败"));
      setSel(new Set()); router.refresh();
    });
  };
  const doSetVisit = () => {
    if (!bulkDate) { window.alert("请先选一个「最近到店日期」"); return; }
    start(async () => {
      const r = await bulkSetLastVisit(Array.from(sel), bulkDate);
      if (!r.ok) window.alert(r.message || "设置失败");
      setSel(new Set()); setBulkDate(""); router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      {/* 批量工具栏 */}
      <div className="sticky top-0 z-10 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            {sel.size > 0 ? `已选 ${sel.size} 位` : "全选"}
          </label>
          {sel.size > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <select
                value={bulkOwner}
                onChange={(e) => setBulkOwner(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600 outline-none"
              >
                <option value="">分配给…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <button onClick={doBulkAssign} disabled={pending} className="rounded-lg bg-brand px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-60">分配</button>
              <button onClick={doReassign} disabled={pending} className="rounded-lg border border-brand/40 bg-brand/5 px-2.5 py-1 text-[11px] text-brand-dark disabled:opacity-60" title="按导入时表格里的负责人重新匹配">重新识别</button>
              <button onClick={doBulkDelete} disabled={pending} className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] text-red-500 disabled:opacity-60">删除</button>
            </div>
          )}
        </div>
        {sel.size > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
            <span className="text-[11px] text-slate-500">设最近到店日期：</span>
            <input
              type="date"
              value={bulkDate}
              onChange={(e) => setBulkDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600 outline-none"
            />
            <button onClick={doSetVisit} disabled={pending} className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700 disabled:opacity-60">设到店日期</button>
            <span className="text-[10px] text-slate-300">（没日期列时用：超 60 天的会自动进「待唤醒」）</span>
          </div>
        )}
      </div>

      {/* 客户列表 */}
      {customers.map((c) => (
        <div key={c.id} className={`rounded-xl border bg-white p-3.5 ${sel.has(c.id) ? "border-brand/50" : "border-slate-200/70"}`}>
          <div className="flex items-start gap-2.5">
            <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="mt-1 shrink-0" />
            <Link href={`/customers/${c.id}`} className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                {c.name}
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${STAGE_COLOR[c.stage] || "bg-slate-100 text-slate-600"}`}>
                  {STAGE_LABEL[c.stage] || c.stage}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {c.assigneeName ? `负责人 ${c.assigneeName}` : "未分配"}
                {c.phone ? ` · ${c.phone}` : ""}
              </div>
              {c.concerns ? (
                <div className="mt-1 text-xs text-amber-600">顾虑：{c.concerns}</div>
              ) : (
                c.notes && <div className="mt-1 line-clamp-1 text-xs text-slate-500">{c.notes}</div>
              )}
            </Link>
            <div className="flex shrink-0 flex-col items-end gap-1.5 self-center">
              {employees.length > 0 && (
                <CustomerAssign customerId={c.id} employees={employees} currentId={c.assigned_to} />
              )}
              <button onClick={() => doDelete(c.id, c.name)} disabled={pending} className="text-[11px] text-red-400 disabled:opacity-60">删除</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
