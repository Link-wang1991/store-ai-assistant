"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/actions";

// 通用表单：提交到 server action，显示结果消息，成功后刷新页面。
export function ActionForm({
  action,
  children,
  submitText = "提交",
  resetOnSuccess = false,
  onDone,
  className = "",
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  submitText?: string;
  resetOnSuccess?: boolean;
  onDone?: (r: ActionResult) => void;
  className?: string;
}) {
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      className={className}
      action={(fd) =>
        start(async () => {
          const r = await action(fd);
          setMsg(r);
          if (r.ok) {
            router.refresh();
            if (resetOnSuccess) ref.current?.reset();
            onDone?.(r);
          }
        })
      }
    >
      {children}
      <button
        type="submit"
        disabled={pending}
        className="app-primary-button mt-3 w-full py-2.5 text-sm disabled:opacity-60"
      >
        {pending ? "处理中…" : submitText}
      </button>
      {msg && (
        <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-600" : "text-red-500"}`}>
          {msg.message}
        </p>
      )}
    </form>
  );
}
