"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEmployeeName } from "@/lib/actions";

// 员工姓名内联改名：点「改名」展开输入框，保存即落库（不用 prompt）
export function EmployeeNameEdit({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  const [pending, start] = useTransition();
  const router = useRouter();

  const save = () => {
    const v = val.trim();
    if (!v || v === name) { setEditing(false); return; }
    start(async () => {
      const r = await updateEmployeeName(id, v);
      if (!r.ok) window.alert(r.message || "改名失败");
      setEditing(false);
      router.refresh();
    });
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          className="w-24 rounded border border-slate-200 px-1.5 py-0.5 text-sm outline-none focus:border-[var(--green)]"
        />
        <button onClick={save} disabled={pending} className="text-[11px] text-[var(--green-dark)]">{pending ? "…" : "保存"}</button>
        <button onClick={() => { setVal(name); setEditing(false); }} className="text-[11px] text-slate-400">取消</button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {name}
      <button onClick={() => setEditing(true)} className="text-[10px] text-slate-300">改名</button>
    </span>
  );
}
