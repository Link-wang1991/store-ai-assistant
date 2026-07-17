"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  COACH_SCENES,
  COACH_OUTPUT_SECTIONS,
  COACH_KNOWLEDGE_HINTS,
  buildCoachPrompt,
} from "@/lib/coach-scenes";
import { BottomNav, MAIN_NAV, STAFF_NAV, type NavItem } from "@/components/BottomNav";
import { customerApi } from "@/lib/api-client";

interface SessionLite {
  id: string;
  title: string | null;
}

interface CustLite {
  id: string;
  name: string;
  phone?: string | null;
  stage?: string | null;
}

export function CoachLanding({
  storeName,
  isAdmin,
  sessions,
  onSessionDelete,
}: {
  storeName: string;
  isAdmin: boolean;
  sessions: SessionLite[];
  onSessionDelete?: (id: string) => void | Promise<void>;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState<CustLite[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const nav: NavItem[] = isAdmin ? MAIN_NAV : STAFF_NAV;

  useEffect(() => {
    customerApi.list().then((r) => {
      if (r.ok && r.data) setCustomers(r.data.map((c: any) => ({ id: c.id, name: c.name, phone: c.phone, stage: c.stage })));
    });
  }, []);

  const go = (prompt: string) => router.push(`/chat?q=${encodeURIComponent(prompt)}`);
  const goCustomer = (id: string) => router.push(`/chat?customerId=${id}&new=1`);

  const filteredCustomers = customers.filter((c) =>
    !customerSearch ||
    c.name?.includes(customerSearch) ||
    c.phone?.includes(customerSearch)
  );

  return (
    <div className="min-h-screen pb-16">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-white px-4 py-3">
        <div className="relative flex items-center justify-center">
          <button
            onClick={() => router.push("/home")}
            className="absolute left-0 flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[15px] font-bold text-[var(--ink)] transition hover:bg-[var(--line)]"
          >
            ←
          </button>
          <div className="text-center">
            <div className="text-[15px] font-semibold text-[var(--ink)]">AI 教练</div>
            <div className="text-[11px] text-[var(--faint)]">{storeName} · 选场景 / 选客户 / 自由问</div>
          </div>
        </div>
      </header>

      <div className="space-y-4 p-4">
        {/* 先选客户 */}
        <section className="rounded-xl border border-[var(--line)] bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-semibold text-slate-800">想让回答更准？先选客户</div>
              <div className="mt-0.5 text-[11px] text-[var(--muted)]">选好后 AI 会结合这位客户的画像、顾虑和历史给出建议</div>
            </div>
            <button
              onClick={() => setPickerOpen((o) => !o)}
              className="shrink-0 rounded-lg bg-[var(--green-soft)] px-3 py-1.5 text-[11px] font-medium text-[var(--green-dark)]"
            >
              {pickerOpen ? "收起" : "选客户"}
            </button>
          </div>
          {pickerOpen && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <input
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="搜索客户姓名 / 手机号…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--green)]"
              />
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {filteredCustomers.length === 0 ? (
                  <div className="py-2 text-center text-[11px] text-slate-400">暂无客户</div>
                ) : (
                  filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => goCustomer(c.id)}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition hover:bg-[var(--green-soft)]"
                    >
                      <span className="text-[13px] text-slate-700">{c.name || "未命名客户"}</span>
                      <span className="text-[10px] text-slate-400">{c.phone || c.stage || ""}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </section>

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
                <div
                  key={s.id}
                  className="group flex items-center justify-between border-b border-slate-50 px-4 py-3 text-sm text-slate-700 last:border-0"
                >
                  <Link
                    href={`/chat?sessionId=${s.id}`}
                    className="flex-1 truncate"
                  >
                    {s.title || "未命名对话"}
                  </Link>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("确定删除这条对话记录吗？")) {
                        onSessionDelete?.(s.id);
                      }
                    }}
                    className="ml-2 rounded p-1 text-[var(--faint)] opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                    title="删除"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <BottomNav items={nav} />
    </div>
  );
}
