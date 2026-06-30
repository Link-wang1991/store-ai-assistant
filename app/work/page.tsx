"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, customerApi } from "@/lib/api-client";
import { PoolCard } from "@/components/PoolCard";
import { COACH_SCENES, buildCoachPrompt } from "@/lib/coach-scenes";
import { BottomNav, STAFF_NAV } from "@/components/BottomNav";

const ROLE_NAME: Record<string, string> = {
  owner: "老板", manager: "店长", consultant: "咨询师", beautician: "美容师", receptionist: "前台", operator: "运营",
};

export default function WorkPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const [custs, setCusts] = useState<any[]>([]);

  useEffect(() => {
    const t = getToken();
    if (!t) { router.replace("/login"); return; }
    try {
      const p = JSON.parse(atob(t.split(".")[1]));
      setRole(p.role || "");
    } catch { router.replace("/login"); return; }

    customerApi.list().then(r => {
      if (r.ok) setCusts(r.data || []);
    }).finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div className="flex h-screen items-center justify-center text-sm text-slate-400">加载中…</div>;

  const name = ROLE_NAME[role] || "员工";

  return (
    <div className="min-h-screen pb-16">
      <header className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="text-[11px] text-slate-400">今日 AI 工作台</div>
        <div className="mt-0.5 text-[18px] font-semibold text-slate-900">{name}</div>
        <div className="text-xs text-slate-500">今天先做这几件，AI 已经帮你排好优先级</div>
      </header>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2">
          {["新客", "老客", "沉睡"].map(l => (
            <div key={l} className="rounded-xl border border-slate-200 bg-white py-2.5 text-center">
              <div className="text-lg font-semibold text-slate-900">
                {l === "新客" ? custs.filter(c => c.stage === "new").length :
                 l === "沉睡" ? custs.filter(c => c.pool === "dormant").length :
                 custs.filter(c => c.stage === "regular" || c.stage === "deal").length}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">{l}</div>
            </div>
          ))}
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[13px] font-semibold text-slate-800">今天最该处理</div>
            <Link href="/customers" className="text-[11px] text-brand-dark">全部客户池 →</Link>
          </div>
          {custs.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
              暂无客户，请联系管理员导入。
            </div>
          ) : (
            <div className="space-y-2.5">
              {custs.slice(0, 5).map((c) => (
                <PoolCard key={c.id} c={{ id: c.id, name: c.name || "客户", stage: c.stage, pool: c.pool || "regular", lastVisitDays: null, nextFollowLabel: null }} />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-2 text-[13px] font-semibold text-slate-800">卡壳了？问 AI 教练</div>
          <div className="flex flex-wrap gap-2">
            {COACH_SCENES.slice(0, 6).map((s) => (
              <Link key={s.code} href={`/chat?q=${encodeURIComponent(buildCoachPrompt(s))}`} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
                {s.label}
              </Link>
            ))}
          </div>
        </section>
      </div>
      <BottomNav items={STAFF_NAV} />
    </div>
  );
}
