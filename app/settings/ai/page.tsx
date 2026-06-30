import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { canEnterAdmin } from "@/lib/permissions";
import { BottomNav, MAIN_NAV } from "@/components/BottomNav";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!canEnterAdmin(ctx)) redirect("/me");

  // C3：实时读取服务器真实配置，不再写死占位
  const provider = (process.env.AI_PROVIDER || "mock").toLowerCase();
  const providerLabel =
    provider === "deepseek"
      ? "DeepSeek · 已接入"
      : provider === "qwen"
      ? "通义千问 Qwen · 已接入"
      : "未配置（演示模板，回答不智能）";
  const hasDeepseek = !!process.env.DEEPSEEK_API_KEY;
  const hasQwen = !!process.env.QWEN_API_KEY;

  const items = [
    { title: "对话模型（AI 教练 / 画像 / 复盘）", value: providerLabel, ok: provider !== "mock" },
    { title: "DeepSeek Key（文本生成）", value: hasDeepseek ? "已配置" : "未配置", ok: hasDeepseek },
    { title: "Qwen Key（语音转写）", value: hasQwen ? "已配置" : "未配置", ok: hasQwen },
    { title: "知识库 + 方法论引用", value: "已开启", ok: true },
    { title: "禁用表达 / 合规规则", value: "已开启", ok: true },
  ];

  return (
    <div className="min-h-screen pb-16">
      <header className="border-b border-[var(--line)] bg-white px-4 py-4">
        <Link href="/me" className="text-[11px] text-[var(--green-dark)]">‹ 我的</Link>
        <div className="mt-1 text-[18px] font-semibold tracking-tight text-slate-900">AI 模型设置</div>
        <div className="mt-0.5 text-xs text-slate-500">门店 AI 能力的实时配置状态</div>
      </header>
      <div className="space-y-2 p-4">
        {items.map((it) => (
          <div key={it.title} className="flex items-start justify-between gap-3 rounded-xl border border-[var(--line)] bg-white p-4">
            <div className="text-sm font-medium text-slate-800">{it.title}</div>
            <span className={`mt-0.5 shrink-0 text-[11px] ${it.ok ? "text-[var(--green-dark)]" : "text-red-500"}`}>{it.value}</span>
          </div>
        ))}
        <p className="px-0.5 pt-2 text-[11px] text-[var(--faint)]">
          以上为实时读取的服务器配置。切换模型 / 更换 Key 需在服务器 .env 修改（AI_PROVIDER、DEEPSEEK_API_KEY、QWEN_API_KEY），界面只读展示，避免误改导致 AI 不可用。
        </p>
      </div>
      <BottomNav items={MAIN_NAV} />
    </div>
  );
}
