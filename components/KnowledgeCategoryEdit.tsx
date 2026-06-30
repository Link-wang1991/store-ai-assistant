"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDocCategory } from "@/lib/actions";

// 知识资料分类下拉：选一下即把该篇资料（含所有片段）转移到新分类
export function KnowledgeCategoryEdit({
  docId,
  category,
  options,
}: {
  docId: string;
  category: string;
  options: string[];
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const opts = options.includes(category) ? options : [category, ...options];

  return (
    <select
      value={category}
      disabled={pending}
      onChange={(e) => {
        const c = e.target.value;
        if (c === category) return;
        start(async () => {
          const r = await updateDocCategory(docId, c);
          if (!r.ok) window.alert(r.message || "转移失败");
          router.refresh();
        });
      }}
      className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-600 outline-none"
    >
      {opts.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
