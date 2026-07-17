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
  { href: "/meeting", label: "会谈", icon: "◉" },
  { href: "/customers", label: "客户", icon: "◎" },
  { href: "/home", label: "首页", icon: "⌂" },
  { href: "/chat", label: "AI教练", icon: "✦" },
  { href: "/me", label: "我的", icon: "☰" },
];

// 员工端：首页指向 /home，其余顺序一致
export const STAFF_NAV: NavItem[] = [
  { href: "/meeting", label: "会谈", icon: "◉" },
  { href: "/customers", label: "客户", icon: "◎" },
  { href: "/home", label: "首页", icon: "⌂" },
  { href: "/chat", label: "AI教练", icon: "✦" },
  { href: "/me", label: "我的", icon: "☰" },
];

// 兼容旧引用
export const ADMIN_NAV = MAIN_NAV;

export function BottomNav({ items, variant = "default" }: { items: NavItem[]; variant?: "default" | "home" }) {
  const pathname = usePathname();
  const exact = ["/home", "/chat"];
  const homeVariant = variant === "home";
  return (
    <nav
      className={homeVariant
        ? "home-bottom-navigation fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[430px]"
        : "fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-[var(--line)] bg-white/95 px-2 backdrop-blur"}
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <ul className={homeVariant ? "flex px-2 py-2" : "flex py-1.5"}>
        {items.map((it) => {
          const active = exact.includes(it.href) ? pathname === it.href : pathname.startsWith(it.href);
          return (
            <li key={it.href} className="flex-1">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`${homeVariant ? "home-bottom-nav-item" : "mx-0.5 flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] transition"} ${
                  active
                    ? homeVariant ? "active" : "bg-[var(--green-soft)] font-medium text-[var(--green-dark)]"
                    : homeVariant ? "" : "text-[var(--faint)]"
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
    strokeWidth: 1.8,
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
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3v-7a9 9 0 1 1 18 0Z" />
      </svg>
    );
  }
  if (href.startsWith("/customers")) {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    );
  }
  if (href === "/chat") {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 10h.01M15.5 10h.01M8.5 15a5 5 0 0 0 7 0" />
    </svg>
  );
}
