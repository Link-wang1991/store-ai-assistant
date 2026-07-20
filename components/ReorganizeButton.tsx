"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { reorganizeImportedCustomers } from "@/lib/actions";

// 一键重新智能整理：不用重传名单，从已存原始行/备注/跟进重点重新解析，补齐到店天数、下一步跟进，并提示疑似负责人
export function ReorganizeButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await reorganizeImportedCustomers();
          window.alert(r.message || (r.ok ? "已重新整理" : "操作失败"));
          router.refresh();
        })
      }
      className="flex w-full items-center justify-between rounded-xl border border-brand/40 bg-brand/5 px-3 py-2.5 text-sm font-medium text-brand-dark disabled:opacity-60"
    >
      <span>{pending ? "正在重新整理…" : "一键重新智能整理已导入客户"}</span>
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  );
}
