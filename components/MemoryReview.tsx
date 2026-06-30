"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewMemory } from "@/lib/actions";

// 单条 AI 记忆的复核操作：准确 / 不准确 / 补充
export function MemoryReview({ customerId, mkey }: { customerId: string; mkey: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = (op: "accurate" | "inaccurate" | "append", text?: string) =>
    start(async () => {
      const r = await reviewMemory(customerId, mkey, op, text);
      if (r.message && !r.ok) window.alert(r.message);
      router.refresh();
    });

  return (
    <div className="mt-1.5 flex items-center gap-3 text-[11px]">
      <button disabled={pending} onClick={() => run("accurate")} className="text-[var(--green-dark)] disabled:opacity-50">
        ✓ 准确
      </button>
      <button
        disabled={pending}
        onClick={() => {
          if (window.confirm("标记为不准确并移除这条记忆？")) run("inaccurate");
        }}
        className="text-slate-400 disabled:opacity-50"
      >
        ✕ 不准确
      </button>
      <button
        disabled={pending}
        onClick={() => {
          const t = window.prompt("补充 / 修正这条记忆：");
          if (t && t.trim()) run("append", t.trim());
        }}
        className="text-slate-400 disabled:opacity-50"
      >
        ✎ 补充
      </button>
    </div>
  );
}
