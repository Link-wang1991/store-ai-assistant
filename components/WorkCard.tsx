"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { poolInsight, type PoolCustomer } from "@/lib/customer-pools";

const POOL_STYLE: Record<string, { label: string; tone: string }> = {
  today: {
    label: "今日到店",
    tone: "green",
  },
  new: {
    label: "新客转化",
    tone: "blue",
  },
  new_deal: {
    label: "新成交",
    tone: "orange",
  },
  regular: {
    label: "老客维护",
    tone: "slate",
  },
  dormant: {
    label: "复购停滞",
    tone: "orange",
  },
  risk: {
    label: "服务风险",
    tone: "red",
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
      className={`home-work-card home-work-card-${style.tone}`}
    >
      <div className="home-work-card-body">
        <div className="flex items-start gap-3">
          <span className="home-work-avatar">
              {c.name.slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[15px] font-semibold text-[#111827]">{c.name}</h3>
                <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#7b8492]">
                  {c.stageLabel} · {ins.aiJudge}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className="text-[11px] text-[#98a2b3]">{c.nextFollowLabel || "尽快跟进"}</span>
                <span className="home-work-tag">{style.label}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="home-work-suggestion">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="m12 3 1.25 3.75L17 8l-3.75 1.25L12 13l-1.25-3.75L7 8l3.75-1.25L12 3Z" />
            <path d="m18.5 14 .75 2.25L21.5 17l-2.25.75L18.5 20l-.75-2.25L15.5 17l2.25-.75L18.5 14Z" />
          </svg>
          <p className="line-clamp-2"><span className="font-medium">建议：</span>{ins.nextAction}</p>
        </div>

        <div className="mt-2 line-clamp-2 rounded-xl bg-[#fbfcfc] px-3 py-2 text-[11px] leading-5 text-[#7b8492]">
          <span className="font-medium text-[#53606f]">推荐话术：</span>{ins.script}
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={goChat}
              className="home-work-secondary"
            >
              问 AI
            </button>
            <Link
              href={`/customers/${c.id}`}
              onClick={(e) => e.stopPropagation()}
              className="home-work-primary"
            >
              画像
            </Link>
        </div>
      </div>
    </div>
  );
}
