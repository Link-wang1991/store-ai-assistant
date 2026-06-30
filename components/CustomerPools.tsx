"use client";

import { useState } from "react";
import { CUSTOMER_POOLS, type PoolCustomer } from "@/lib/customer-pools";
import { PoolCard } from "@/components/PoolCard";

export type { PoolCustomer };

export function CustomerPools({
  customers,
  initialPool,
  poolLabels,
}: {
  customers: PoolCustomer[];
  initialPool?: string;
  poolLabels?: Record<string, string>;
}) {
  const counts: Record<string, number> = {};
  for (const c of customers) counts[c.pool] = (counts[c.pool] || 0) + 1;

  // 优先用外部指定的池（从首页概览点进来），否则选第一个有客户的池
  const firstNonEmpty = CUSTOMER_POOLS.find((p) => counts[p.code])?.code || CUSTOMER_POOLS[0].code;
  const valid = initialPool && CUSTOMER_POOLS.some((p) => p.code === initialPool) ? initialPool : firstNonEmpty;
  const [active, setActive] = useState(valid);

  const activeMeta = CUSTOMER_POOLS.find((p) => p.code === active)!;
  const list = customers.filter((c) => c.pool === active);

  return (
    <div className="space-y-3">
      {/* 6 池 chip 横向切换 */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {CUSTOMER_POOLS.map((p) => {
          const on = p.code === active;
          return (
            <button
              key={p.code}
              onClick={() => setActive(p.code)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
                on
                  ? "border-transparent bg-[var(--green-soft)] font-medium text-[var(--green-dark)]"
                  : "border-[var(--line)] bg-white text-[var(--muted)]"
              }`}
            >
              {poolLabels?.[p.code] || p.label}
              <span className={`rounded-full px-1.5 text-[10px] ${on ? "bg-white/70" : "bg-slate-100"}`}>
                {counts[p.code] || 0}
              </span>
            </button>
          );
        })}
      </div>

      <p className="px-0.5 text-[11px] text-[var(--faint)]">{activeMeta.desc}</p>

      {/* 机会卡 */}
      {list.length === 0 ? (
        <div className="rounded-xl border border-[var(--line)] bg-white p-6 text-center text-xs text-slate-400">
          这个池暂时没有客户
        </div>
      ) : (
        <div className="space-y-2.5">
          {list.map((c) => (
            <PoolCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}
