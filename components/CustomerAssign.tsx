"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignCustomer } from "@/lib/actions";

// 给「待分配公海」客户指定负责人：选一下即归到对方名下、进 ta 的跟进列表
export function CustomerAssign({
  customerId,
  employees,
  currentId,
}: {
  customerId: string;
  employees: { id: string; name: string }[];
  currentId?: string | null;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const assigned = !!currentId;
  return (
    <select
      defaultValue={currentId || ""}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        if (!v || v === currentId) return;
        start(async () => {
          const r = await assignCustomer(customerId, v);
          if (!r.ok) window.alert(r.message || "分配失败");
          router.refresh();
        });
      }}
      className={`rounded-lg border px-2 py-1 text-[11px] outline-none disabled:opacity-60 ${
        assigned ? "border-slate-200 bg-white text-slate-600" : "border-amber-300 bg-amber-50 text-amber-700"
      }`}
    >
      <option value="">{assigned ? "改负责人…" : "分配给…"}</option>
      {employees.map((e) => (
        <option key={e.id} value={e.id}>{e.name}</option>
      ))}
    </select>
  );
}
