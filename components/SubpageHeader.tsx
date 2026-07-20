import Link from "next/link";

export function SubpageHeader({
  title,
  description,
  backHref = "/me",
}: {
  title: string;
  description?: string;
  backHref?: string;
}) {
  return (
    <header className="subpage-header">
      <Link href={backHref} className="subpage-back" aria-label="返回上一页">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </Link>
      <div className="min-w-0">
        <h1 className="subpage-title">{title}</h1>
        {description && <p className="subpage-description">{description}</p>}
      </div>
    </header>
  );
}
