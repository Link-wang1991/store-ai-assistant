"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/actions";

// 绑定好参数的 server action 触发按钮（用于停用/删除/处理等）
export function ActionButton({
  action,
  label,
  confirmText,
  className = "text-xs text-slate-500",
  redirectTo,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  confirmText?: string;
  className?: string;
  redirectTo?: string; // 成功后跳转（如删除当前实体后回列表）
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pending}
      className={`${className} disabled:opacity-50`}
      onClick={() => {
        if (confirmText && !window.confirm(confirmText)) return;
        start(async () => {
          const r = await action();
          if (r.message && !r.ok) window.alert(r.message);
          if (r.ok && redirectTo) router.push(redirectTo);
          else router.refresh();
        });
      }}
    >
      {pending ? "…" : label}
    </button>
  );
}
