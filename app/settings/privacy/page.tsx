import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { canEnterAdmin } from "@/lib/permissions";
import { BottomNav, MAIN_NAV } from "@/components/BottomNav";

export const dynamic = "force-dynamic";

const POLICIES = [
  { title: "录音仅用于内部复盘", desc: "会谈录音只用于门店服务复盘与需求记录，不对外公开", on: true },
  { title: "录音文件私有存储", desc: "存于私有空间，仅通过短时效签名链接访问，不可公开下载", on: true },
  { title: "访问留痕", desc: "每次查看转写/报告都会记录操作人与时间", on: true },
  { title: "客户可要求删除", desc: "客户提出后可删除录音，复盘报告可保留", on: true },
  { title: "删除录音保留复盘", desc: "删除原声后，AI 复盘结论仍保留供经营参考", on: true },
];

export default async function PrivacySettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!canEnterAdmin(ctx)) redirect("/me");

  return (
    <div className="min-h-screen pb-16">
      <header className="border-b border-[var(--line)] bg-white px-4 py-4">
        <Link href="/me" className="text-[11px] text-[var(--green-dark)]">‹ 我的</Link>
        <div className="mt-1 text-[18px] font-semibold tracking-tight text-slate-900">录音隐私设置</div>
        <div className="mt-0.5 text-xs text-slate-500">门店当前的录音与隐私保护策略</div>
      </header>
      <div className="space-y-2 p-4">
        {POLICIES.map((p) => (
          <div key={p.title} className="flex items-start justify-between gap-3 rounded-xl border border-[var(--line)] bg-white p-4">
            <div>
              <div className="text-sm font-medium text-slate-800">{p.title}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{p.desc}</div>
            </div>
            <span className="mt-0.5 shrink-0 rounded-full bg-[var(--green-soft)] px-2 py-0.5 text-[10px] text-[var(--green-dark)]">已开启</span>
          </div>
        ))}
        <p className="px-0.5 pt-2 text-[11px] text-[var(--faint)]">以上为门店默认隐私策略。可调开关的精细化设置正在接入。</p>
      </div>
      <BottomNav items={MAIN_NAV} />
    </div>
  );
}
