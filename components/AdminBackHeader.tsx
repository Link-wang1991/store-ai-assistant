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
    <div className="sticky top-0 z-30 border-b border-[var(--line)] bg-white px-4 py-3">
      <div className="relative flex items-center justify-center">
        <Link
          href={backHref}
          className="absolute left-0 flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-2)] text-center text-[15px] font-bold text-[var(--ink)] transition hover:bg-[var(--line)]"
        >
          ←
        </Link>
        <div className="text-center">
          <div className="text-[15px] font-semibold text-[var(--ink)]">{title}</div>
          {subtitle && <div className="text-[11px] text-[var(--faint)]">{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}
