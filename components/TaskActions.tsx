"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTaskStatus } from "@/lib/actions";

export function TaskActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function set(next: string, askFeedback = false) {
    let feedback: string | undefined;
    if (askFeedback) {
      feedback = window.prompt("填写完成反馈（可留空）") || undefined;
    }
    start(async () => {
      const r = await updateTaskStatus(id, next, feedback);
      if (!r.ok) window.alert(r.message);
      router.refresh();
    });
  }

  if (status === "done" || status === "canceled") {
    return <span className="text-xs text-slate-400">{status === "done" ? "已完成" : "已取消"}</span>;
  }

  return (
    <div className="flex gap-2">
      {status === "todo" && (
        <button
          disabled={pending}
          onClick={() => set("doing")}
          className="rounded-full border border-brand px-3 py-1 text-xs text-brand-dark disabled:opacity-50"
        >
          开始
        </button>
      )}
      <button
        disabled={pending}
        onClick={() => set("done", true)}
        className="rounded-full bg-brand px-3 py-1 text-xs text-white disabled:opacity-50"
      >
        完成
      </button>
    </div>
  );
}
