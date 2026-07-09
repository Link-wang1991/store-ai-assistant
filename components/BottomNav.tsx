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

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const exact = ["/home", "/chat"];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-[var(--line)] bg-white/95 px-2 backdrop-blur"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <ul className="flex py-1.5">
        {items.map((it) => {
          const active = exact.includes(it.href) ? pathname === it.href : pathname.startsWith(it.href);
          const isHome = it.label === "首页";
          return (
            <li key={it.href} className="flex-1">
              <Link
                href={it.href}
                className={`mx-0.5 flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] transition ${
                  active
                    ? "bg-[var(--green-soft)] font-medium text-[var(--green-dark)]"
                    : "text-[var(--faint)]"
                } ${isHome ? "relative -top-1" : ""}`}
              >
                <span className={`leading-none ${isHome ? "text-[21px]" : "text-[17px]"}`}>{it.icon}</span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
