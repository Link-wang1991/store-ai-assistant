"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { poolInsight, type PoolCustomer } from "@/lib/customer-pools";

const POOL_STYLE: Record<string, { label: string; bar: string; avatar: string; tag: string }> = {
  today: {
    label: "今日到店",
    bar: "bg-[var(--green)]",
    avatar: "bg-[var(--green-soft)] text-[var(--green-dark)]",
    tag: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
  new: {
    label: "新客转化",
    bar: "bg-sky-500",
    avatar: "bg-sky-50 text-sky-700",
    tag: "bg-sky-50 text-sky-700 border-sky-100",
  },
  new_deal: {
    label: "新成交",
    bar: "bg-teal-500",
    avatar: "bg-teal-50 text-teal-700",
    tag: "bg-teal-50 text-teal-700 border-teal-100",
  },
  regular: {
    label: "老客维护",
    bar: "bg-slate-300",
    avatar: "bg-slate-100 text-slate-600",
    tag: "bg-slate-100 text-slate-600 border-slate-200",
  },
  dormant: {
    label: "复购停滞",
    bar: "bg-amber-400",
    avatar: "bg-amber-50 text-amber-700",
    tag: "bg-amber-50 text-amber-700 border-amber-100",
  },
  risk: {
    label: "服务风险",
    bar: "bg-red-500",
    avatar: "bg-red-50 text-red-700",
    tag: "bg-red-50 text-red-700 border-red-100",
  },
};

export function WorkCard({ c }: { c: PoolCustomer }) {
  const router = useRouter();
  const ins = poolInsight(c, c.pool);
  const style = POOL_STYLE[c.pool] || POOL_STYLE.regular;

  const goProfile = () => router.push(`/customers/${c.id}`);
  const goChat = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(
      `/chat?customerId=${c.id}&q=${encodeURIComponent(`客户「${c.name}」现在该怎么跟进？给我判断、话术和下一步`)}`
    );
  };

  return (
    <div
      onClick={goProfile}
      className="relative cursor-pointer overflow-hidden rounded-2xl border border-[var(--line)] bg-white transition active:bg-slate-50"
    >
      {/* 左侧色条 */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${style.bar}`} />

      <div className="p-4 pl-5">
        {/* 头部：头像 + 姓名 + 标签 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${style.avatar}`}
            >
              {c.name.slice(0, 1)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[16px] font-semibold text-slate-900">{c.name}</span>
              <span className="block truncate text-[11px] text-[var(--faint)]">{c.stageLabel}</span>
            </span>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${style.tag}`}>
            {style.label}
          </span>
        </div>

        {/* 关键信息网格 */}
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
          <div className="truncate">
            <span className="text-[var(--faint)]">当前阶段</span>
            <span className="ml-1.5 font-medium text-slate-700">{c.stageLabel}</span>
          </div>
          <div className="truncate">
            <span className="text-[var(--faint)]">上次到店</span>
            <span className="ml-1.5 font-medium text-slate-700">{c.lastVisitDate || "-"}</span>
          </div>
          <div className="truncate">
            <span className="text-[var(--faint)]">上次互动</span>
            <span className="ml-1.5 font-medium text-slate-700">{c.lastActive}</span>
          </div>
          <div className="truncate">
            <span className="text-[var(--faint)]">AI判断</span>
            <span className="ml-1.5 font-medium text-slate-700">{ins.aiJudge}</span>
          </div>
        </div>

        {/* AI 建议 */}
        <div className="mt-3 text-[12px] text-slate-700">
          <span className="font-semibold text-[var(--green-dark)]">AI建议：</span>
          {ins.nextAction}
        </div>

        {/* 推荐话术 */}
        <div className="mt-2 rounded-xl border border-[rgba(11,168,119,0.15)] bg-[var(--green-soft)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--green-dark)]">
          {ins.script}
        </div>

        {/* 底部：下一步 + 操作 */}
        <div className="mt-3 flex items-center justify-between">
          <div className="min-w-0 text-[11px]">
            <span className="text-[var(--faint)]">下一步：</span>
            <span className="font-medium text-[var(--green-dark)]">{c.nextFollowLabel || "今天尽快跟进"}</span>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              onClick={goChat}
              className="rounded-lg border border-[var(--line)] bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600"
            >
              问 AI
            </button>
            <Link
              href={`/customers/${c.id}`}
              onClick={(e) => e.stopPropagation()}
              className="rounded-lg bg-[var(--green)] px-2.5 py-1.5 text-[11px] font-medium text-white"
            >
              画像
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
