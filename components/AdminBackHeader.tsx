import Link from "next/link";

export function AdminBackHeader({
  title,
  subtitle,
  backHref = "/admin",
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
}) {
  return (
    <div className="admin-back-header">
      <div className="relative flex items-center justify-center">
        <Link
          href={backHref}
          className="admin-back-button"
          aria-label="返回管理页"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </Link>
        <div className="text-center">
          <div className="admin-back-title">{title}</div>
          {subtitle && <div className="admin-back-subtitle">{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}
