"use client";

import { useEffect } from "react";
import Link from "next/link";

/** 路由级异常不能留在无限加载页；保留可恢复入口，避免员工误以为业务数据丢失。 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // 错误详情只写浏览器控制台，不把内部信息展示给门店员工。
    console.error("门店助手页面异常", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--page)] p-6 text-center">
      <section className="w-full max-w-sm rounded-3xl border border-[var(--line)] bg-white p-6 shadow-sm">
        <p className="text-lg font-semibold text-[var(--ink)]">页面暂时无法打开</p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">已保存的录音、会谈和待办不会因为页面刷新而丢失。请先重试；若仍失败，再回到首页。</p>
        <div className="mt-5 flex justify-center gap-3">
          <button onClick={reset} className="rounded-full bg-[var(--green)] px-4 py-2 text-sm font-medium text-white">重试</button>
          <Link href="/" className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--green-dark)]">回到首页</Link>
        </div>
      </section>
    </main>
  );
}
