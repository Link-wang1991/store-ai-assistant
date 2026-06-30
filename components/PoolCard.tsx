"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { poolInsight, type PoolCustomer } from "@/lib/customer-pools";

// 单张机会卡：整卡可点进客户画像；卡内「问 AI」按钮单独跳转（阻止冒泡）。
export function PoolCard({ c }: { c: PoolCustomer }) {
  const router = useRouter();
  const ins = poolInsight(c, c.pool);
  const goProfile = () => router.push(`/customers/${c.id}`);
  const goAsk = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(
      `/chat?customerId=${c.id}&q=${encodeURIComponent(`客户「${c.name}」现在该怎么跟进？给我判断、话术和下一步`)}`
    );
  };

  return (
    <div
      onClick={goProfile}
      className="cursor-pointer rounded-xl border border-[var(--line)] bg-white p-4 transition active:bg-slate-50"
    >
      {/* 头部：客户 + 阶段 + 可见性 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--green-soft)] text-sm font-semibold text-[var(--green-dark)]">
            {c.name.slice(0, 1)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-900">{c.name}</span>
            <span className="text-[11px] text-[var(--muted)]">
              {c.stageLabel}
              {c.lastVisitDays != null ? ` · ${c.lastVisitDays} 天没到店` : ` · 上次互动 ${c.lastActive}`}
            </span>
          </span>
        </div>
        <span className="shrink-0 rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400">
          {c.ownerVisible ? "老板可见" : "仅本人"}
        </span>
      </div>

      <p className="mt-2.5 text-[11px] text-[var(--faint)]">
        为什么在这里 · {ins.reason}
        {typeof ins.confidence === "number" && (
          <span className="ml-1 text-[var(--green-dark)]">· 可信度 {Math.round(ins.confidence * 100)}%</span>
        )}
        {ins.needsReview && <span className="ml-1 text-amber-600">· 需复核</span>}
      </p>

      <div className="mt-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
        <span className="font-medium text-slate-500">AI 判断：</span>{ins.aiJudge}
        {ins.evidence?.length ? (
          <div className="mt-1 text-[11px] text-slate-400">依据：{ins.evidence[0]}</div>
        ) : null}
      </div>

      <div className="mt-1.5 rounded-lg bg-[var(--green-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--green-dark)]">
        <span className="font-medium">推荐话术：</span>“{ins.script}”
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <div className="min-w-0 text-[11px] text-slate-500">
          <span className="text-slate-400">下一步：</span>{ins.nextAction}
          {c.nextFollowLabel && <span className="text-[var(--green-dark)]"> · 约 {c.nextFollowLabel} 跟进</span>}
          {ins.riskNote && <span className="mt-0.5 block text-amber-600">提醒：{ins.riskNote}</span>}
          <span className="mt-0.5 block text-[var(--faint)]">负责人：{c.assigneeLabel}</span>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button onClick={goAsk} className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[11px] text-slate-600">
            问 AI
          </button>
          <Link
            href={`/customers/${c.id}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg border border-[var(--green)]/40 bg-[var(--green-soft)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--green-dark)]"
          >
            画像
          </Link>
        </div>
      </div>
    </div>
  );
}
