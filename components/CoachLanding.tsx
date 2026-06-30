"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  COACH_SCENES,
  COACH_OUTPUT_SECTIONS,
  COACH_KNOWLEDGE_HINTS,
  buildCoachPrompt,
} from "@/lib/coach-scenes";
import { BottomNav, MAIN_NAV, STAFF_NAV, type NavItem } from "@/components/BottomNav";

interface SessionLite {
  id: string;
  title: string | null;
}

export function CoachLanding({
  storeName,
  isAdmin,
  sessions,
}: {
  storeName: string;
  isAdmin: boolean;
  sessions: SessionLite[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const nav: NavItem[] = isAdmin ? MAIN_NAV : STAFF_NAV;

  const go = (prompt: string) => router.push(`/chat?q=${encodeURIComponent(prompt)}`);

  return (
    <div className="min-h-screen pb-16">
      <header className="border-b border-[var(--line)] bg-white px-4 py-4">
        <div className="text-[18px] font-semibold tracking-tight text-slate-900">AI 教练</div>
        <div className="mt-0.5 text-xs text-slate-500">{storeName} · 选一个场景，直接拿到判断、话术和下一步</div>
      </header>

      <div className="space-y-4 p-4">
        {/* 场景网格 */}
        <section>
          <div className="mb-2 px-0.5 text-[13px] font-semibold text-slate-800">遇到这些情况，点一下就问</div>
          <div className="grid grid-cols-2 gap-2">
            {COACH_SCENES.map((s) => (
              <button
                key={s.code}
                onClick={() => go(buildCoachPrompt(s))}
                className="rounded-xl border border-[var(--line)] bg-white p-3 text-left transition hover:border-slate-300"
              >
                <div className="text-sm font-medium text-slate-800">{s.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">{s.hint}</div>
              </button>
            ))}
          </div>
        </section>

        {/* 输出结构说明 */}
        <section className="rounded-xl border border-[var(--line)] bg-white p-4">
          <div className="text-[13px] font-semibold text-slate-800">每次回答都给你这 9 块</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {COACH_OUTPUT_SECTIONS.map((s, i) => (
              <span key={s} className="rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                {i + 1}. {s}
              </span>
            ))}
          </div>
          <div className="mt-3 border-t border-slate-100 pt-3">
            <div className="text-[11px] font-medium text-slate-500">参考知识来源（会引用门店知识库）</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {COACH_KNOWLEDGE_HINTS.map((k) => (
                <span key={k} className="rounded-md bg-[var(--green-soft)] px-2 py-1 text-[11px] text-[var(--green-dark)]">
                  {k}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* 自由提问 */}
        <section className="rounded-xl border border-[var(--line)] bg-white p-3">
          <div className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && q.trim()) go(q.trim());
              }}
              placeholder="也可以直接问一句，比如「客户说回去和老公商量」"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--green)]"
            />
            <button
              onClick={() => q.trim() && go(q.trim())}
              className="shrink-0 rounded-lg bg-[var(--green-soft)] px-3 text-sm font-medium text-[var(--green-dark)]"
            >
              问
            </button>
          </div>
        </section>

        {/* 历史对话 */}
        <section>
          <div className="mb-2 flex items-center justify-between px-0.5">
            <div className="text-[13px] font-semibold text-slate-800">最近对话</div>
            <Link href="/chat?new=1" className="text-[11px] text-[var(--green-dark)]">+ 新对话</Link>
          </div>
          {sessions.length === 0 ? (
            <div className="rounded-xl border border-[var(--line)] bg-white p-5 text-center text-xs text-slate-400">还没有对话记录</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
              {sessions.map((s) => (
                <Link
                  key={s.id}
                  href={`/chat?sessionId=${s.id}`}
                  className="flex items-center justify-between border-b border-slate-50 px-4 py-3 text-sm text-slate-700 last:border-0"
                >
                  <span className="truncate">{s.title || "未命名对话"}</span>
                  <span className="shrink-0 text-[var(--faint)]">›</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
      <BottomNav items={nav} />
    </div>
  );
}
