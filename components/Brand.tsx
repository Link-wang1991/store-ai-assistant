import Image from "next/image";

export function Brand({ compact = false, title = "门店 AI Inbox" }: { compact?: boolean; title?: string }) {
  return (
    <span className={`ref-brand ${compact ? "ref-brand-compact" : ""}`}>
      <Image src="/icon.svg" alt="门店 AI Inbox" width={32} height={32} className="ref-brand-logo" priority={compact} />
      <span>{title}</span>
    </span>
  );
}

export function AccountIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="9" r="3" />
      <path d="M6.7 19.1a5.8 5.8 0 0 1 10.6 0" />
    </svg>
  );
}
