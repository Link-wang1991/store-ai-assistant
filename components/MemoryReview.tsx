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
      <button disabled={pending} onClick={() => run("accurate")} className="inline-flex items-center gap-1 text-[var(--green-dark)] disabled:opacity-50">
        <ReviewIcon type="check" /> 准确
      </button>
      <button
        disabled={pending}
        onClick={() => {
          if (window.confirm("标记为不准确并移除这条记忆？")) run("inaccurate");
        }}
        className="inline-flex items-center gap-1 text-[#718077] disabled:opacity-50"
      >
        <ReviewIcon type="close" /> 不准确
      </button>
      <button
        disabled={pending}
        onClick={() => {
          const t = window.prompt("补充 / 修正这条记忆：");
          if (t && t.trim()) run("append", t.trim());
        }}
        className="inline-flex items-center gap-1 text-[#718077] disabled:opacity-50"
      >
        <ReviewIcon type="edit" /> 补充
      </button>
    </div>
  );
}

function ReviewIcon({ type }: { type: "check" | "close" | "edit" }) {
  const common = {
    viewBox: "0 0 24 24",
    className: "h-3.5 w-3.5",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (type === "check") return <svg {...common}><path d="m5 12.5 4.2 4L19 7" /></svg>;
  if (type === "close") return <svg {...common}><path d="m7 7 10 10M17 7 7 17" /></svg>;
  return <svg {...common}><path d="m4 20 4.1-1 10.4-10.4a2.1 2.1 0 0 0-3-3L5.1 16 4 20Z" /><path d="m13.8 7.2 3 3" /></svg>;
}
