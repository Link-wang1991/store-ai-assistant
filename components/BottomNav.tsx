"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

// 底部 5 导航：会谈 / 客户 / 首页(居中放大突出) / AI教练 / 我的
export const MAIN_NAV: NavItem[] = [
  { href: "/meeting", label: "会谈", icon: "mic" },
  { href: "/customers", label: "客户", icon: "group" },
  { href: "/home", label: "首页", icon: "home" },
  { href: "/chat", label: "AI教练", icon: "psychology" },
  { href: "/me", label: "我的", icon: "account" },
];

// 员工端：首页指向 /home，其余顺序一致
export const STAFF_NAV: NavItem[] = [
  { href: "/meeting", label: "会谈", icon: "mic" },
  { href: "/customers", label: "客户", icon: "group" },
  { href: "/home", label: "首页", icon: "home" },
  { href: "/chat", label: "AI教练", icon: "psychology" },
  { href: "/me", label: "我的", icon: "account" },
];

// 兼容旧引用
export const ADMIN_NAV = MAIN_NAV;

export function BottomNav({ items, variant = "default", activeHref }: { items: NavItem[]; variant?: "default" | "home"; activeHref?: string }) {
  const pathname = usePathname();
  const exact = ["/home", "/chat"];
  const homeVariant = variant === "home";
  return (
    <nav
      className={homeVariant
        ? "home-bottom-navigation fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[430px]"
        : "fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[430px] border-t border-[#e9ecef] bg-white/95 px-2 shadow-[0_-4px_20px_rgba(17,38,23,.035)] backdrop-blur"}
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <ul className={homeVariant ? "flex px-2 py-2" : "flex min-h-[64px] py-1.5"}>
        {items.map((it) => {
          const active = activeHref ? it.href === activeHref : (exact.includes(it.href) ? pathname === it.href : (pathname === it.href || pathname.startsWith(`${it.href}/`)));
          return (
            <li key={it.href} className="flex-1">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`${homeVariant ? "home-bottom-nav-item" : "mx-0.5 flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl py-1 text-[11px] transition"} ${
                  active
                    ? homeVariant ? "active" : "bg-[#eef6eb] font-bold text-[#006d37]"
                    : homeVariant ? "" : "text-[#718077] hover:bg-[#f5f8f5]"
                }`}
              >
                <NavLineIcon href={it.href} active={active} />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function NavLineIcon({ href, active }: { href: string; active: boolean }) {
  const common = {
    className: "h-[21px] w-[21px]",
    fill: active && href === "/home" ? "currentColor" : "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (href === "/home") {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z" />
      </svg>
    );
  }
  if (href.startsWith("/meeting")) {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17v4M8.5 21h7" />
      </svg>
    );
  }
  if (href.startsWith("/customers")) {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
        <path d="M16.5 5.3a3.1 3.1 0 0 1 0 5.8M17.3 14.1a5.1 5.1 0 0 1 3.2 4.8" />
      </svg>
    );
  }
  if (href === "/chat") {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="M12 3.5a7 7 0 0 0-6.9 7.1c0 3.2 2 5.9 4.9 6.8v2.1h4v-2.1a7.1 7.1 0 0 0 4.9-6.8A7 7 0 0 0 12 3.5Z" />
        <path d="M8.9 10.4c.5-1.1 1.5-1.8 3.1-1.8 1.7 0 2.8.8 3.1 2M8.5 14c.8.8 2 1.3 3.5 1.3s2.7-.5 3.5-1.3M12 8.6v6.7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" {...common}>
      <circle cx="12" cy="12" r="8.8" />
      <circle cx="12" cy="9" r="3" />
      <path d="M6.7 19.1a5.8 5.8 0 0 1 10.6 0" />
    </svg>
  );
}
