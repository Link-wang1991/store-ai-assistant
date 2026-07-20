import Link from "next/link";
import { RISK_LEVEL_COLORS, RISK_LEVEL_LABELS, type RiskLevel } from "@/lib/constants";

// ============================================================
// 基础 UI 组件：与门店 AI Inbox 一致的柔和绿底、白色卡片与细边界。
// ============================================================

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`ui-card ${className}`}>
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
    <div className="ui-section-header">
      <div>
        <h2>{title}</h2>
        {desc && <p>{desc}</p>}
      </div>
      {action && <div className="ui-section-action">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  href,
  accent = "text-[var(--ink)]",
}: {
  label: string;
  value: number | string;
  href?: string;
  accent?: string;
}) {
  const inner = (
    <div className="ui-stat-card">
      <div className={`text-[22px] font-semibold leading-none ${accent}`}>{value}</div>
      <div>{label}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function RiskBadge({ level }: { level?: string | null }) {
  if (!level) return null;
  const lv = level as RiskLevel;
  const cls = RISK_LEVEL_COLORS[lv] || "bg-[var(--surface-2)] text-[var(--muted)]";
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {lv} · {RISK_LEVEL_LABELS[lv] || ""}
    </span>
  );
}

export function Tag({
  children,
  className = "bg-[var(--surface-2)] text-[var(--muted)]",
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
    <div className="ui-empty-state">
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
    <div className="ui-page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
