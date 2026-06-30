"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEmployeeRole, transferCustomers } from "@/lib/actions";

// 改员工角色（下拉即存）——员工权限由角色决定
export function EmployeeRoleEdit({
  id,
  role,
  options,
}: {
  id: string;
  role: string;
  options: { key: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <select
      value={role}
      disabled={pending}
      onChange={(e) => {
        const r = e.target.value;
        if (r === role) return;
        start(async () => {
          const res = await updateEmployeeRole(id, r);
          if (!res.ok) window.alert(res.message || "改角色失败");
          router.refresh();
        });
      }}
      className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 outline-none"
    >
      {options.map((o) => (
        <option key={o.key} value={o.key}>{o.name}</option>
      ))}
    </select>
  );
}

// 把某员工名下的客户批量转给另一个员工（离职交接）
export function CustomerTransfer({
  fromId,
  employees,
}: {
  fromId: string;
  employees: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [toId, setToId] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const others = employees.filter((e) => e.id !== fromId);

  const doTransfer = () => {
    if (!toId) return;
    start(async () => {
      const r = await transferCustomers(fromId, toId);
      window.alert(r.message);
      setOpen(false);
      setToId("");
      router.refresh();
    });
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11px] text-[var(--green-dark)]">
        转移客户
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={toId}
        onChange={(e) => setToId(e.target.value)}
        className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] outline-none"
      >
        <option value="">转给…</option>
        {others.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>
      <button onClick={doTransfer} disabled={pending || !toId} className="text-[11px] text-[var(--green-dark)] disabled:opacity-40">
        {pending ? "…" : "确认"}
      </button>
      <button onClick={() => { setOpen(false); setToId(""); }} className="text-[11px] text-slate-400">取消</button>
    </span>
  );
}
