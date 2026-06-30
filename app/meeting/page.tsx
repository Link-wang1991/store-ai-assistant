import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { MeetingClient } from "@/components/MeetingClient";
import { SectionHeader } from "@/components/ui";
import { BottomNav, MAIN_NAV, STAFF_NAV } from "@/components/BottomNav";
import { canEnterAdmin } from "@/lib/permissions";
import { SCENE_LABEL } from "@/lib/scenes";
import { fmtTime } from "@/lib/format";

export const dynamic = "force-dynamic";
const STATUS_LABEL: Record<string, string> = {
  recording: "录音中", transcribing: "转写中", analyzing: "分析中", done: "已完成", failed: "失败",
};

export default async function MeetingPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const customers = (await db.customers.listByStore(ctx.store.id)) as any[];
  const isAdmin = canEnterAdmin(ctx);
  // 老板/店长看全店会谈记录，员工只看自己录的
  const rawMeetings = (isAdmin
    ? await db.meetings.listByStore(ctx.store.id, 40)
    : await db.meetings.listByEmployee(ctx.store.id, ctx.employee.id, 20)) as any[];
  // 隐藏卡死的"录音中"僵尸（重复点击产生、从未上传录音）：recording 且创建已超 10 分钟
  const now = Date.now();
  const myMeetings = rawMeetings.filter(
    (m) => !(m.status === "recording" && now - new Date(m.created_at).getTime() > 10 * 60 * 1000)
  );
  const nav = isAdmin ? MAIN_NAV : STAFF_NAV;

  return (
    <div className="min-h-screen pb-16">
      <header className="flex items-center justify-between border-b border-slate-200/70 bg-white px-4 py-4">
        <div>
          <div className="text-[18px] font-semibold tracking-tight text-slate-900">客户会谈复盘</div>
          <div className="mt-0.5 text-xs text-slate-500">录下真实会谈，AI 帮你复盘需求、机会与沟通短板</div>
        </div>
        <div className="flex shrink-0 gap-3 text-xs">
          <Link href="/work" className="text-slate-500">工作台</Link>
          <Link href="/chat" className="text-brand-dark">AI 对话</Link>
        </div>
      </header>

      <MeetingClient customers={customers.map((c) => ({ id: c.id, name: c.name }))} />

      {/* 我的会谈记录 */}
      <div className="px-4 pb-4 pt-1">
        <SectionHeader title={isAdmin ? "全店会谈记录" : "我的会谈记录"} />
        {myMeetings.length === 0 ? (
          <p className="text-xs text-slate-400">还没有会谈记录。上方选好客户和场景，点「开始会谈记录」。</p>
        ) : (
          <div className="space-y-2">
            {myMeetings.map((m) => (
              <Link key={m.id} href={`/meeting/${m.id}`} className="block rounded-xl border border-slate-200/70 bg-white p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-800">
                    {m.customer_records?.name || "临时客户"}
                    <span className="ml-2 text-xs text-slate-400">{SCENE_LABEL[m.scene] || m.scene}</span>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${m.status === "done" ? "bg-emerald-100 text-emerald-700" : m.status === "failed" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"}`}>
                    {STATUS_LABEL[m.status] || m.status}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">{fmtTime(m.created_at)}{m.employees?.name ? ` · ${m.employees.name}` : ""}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <BottomNav items={nav} />
    </div>
  );
}
