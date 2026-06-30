import Link from "next/link";
import { RISK_LEVEL_COLORS, RISK_LEVEL_LABELS, type RiskLevel } from "@/lib/constants";

// ============================================================
// 基础 UI 组件：GPT 简约风 —— 白底、细边、克制配色、充足留白、无重阴影。
// 设计 token：卡片 rounded-xl + border-slate-200/70；强调色 brand 克制使用；
// 次要信息用 slate-400/500；分区用 SectionHeader 统一头部。
// ============================================================

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200/70 bg-white p-4 ${className}`}>
      {children}
    </div>
  );
}

// 分类板块头部：统一的小标题 + 可选右侧操作（让"每个大问题单独成块"视觉一致）
export function SectionHeader({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-end justify-between px-0.5">
      <div>
        <h2 className="text-[13px] font-semibold tracking-tight text-slate-800">{title}</h2>
        {desc && <p className="mt-0.5 text-[11px] text-slate-400">{desc}</p>}
      </div>
      {action && <div className="text-[12px] text-slate-400">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  href,
  accent = "text-slate-900",
}: {
  label: string;
  value: number | string;
  href?: string;
  accent?: string;
}) {
  const inner = (
    <div className="rounded-xl border border-slate-200/70 bg-white px-3.5 py-3 transition hover:border-slate-300">
      <div className={`text-[22px] font-semibold leading-none ${accent}`}>{value}</div>
      <div className="mt-1.5 text-xs text-slate-500">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function RiskBadge({ level }: { level?: string | null }) {
  if (!level) return null;
  const lv = level as RiskLevel;
  const cls = RISK_LEVEL_COLORS[lv] || "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {lv} · {RISK_LEVEL_LABELS[lv] || ""}
    </span>
  );
}

export function Tag({
  children,
  className = "bg-slate-100 text-slate-600",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] ${className}`}>
      {children}
    </span>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200/70 bg-white px-4 py-3.5">
      <div>
        <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
