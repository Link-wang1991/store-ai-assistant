"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

// 原型 5 导航：首页 / 会谈 / 客户 / AI教练 / 我的（老板端）
export const MAIN_NAV: NavItem[] = [
  { href: "/admin", label: "首页", icon: "⌂" },
  { href: "/meeting", label: "会谈", icon: "◉" },
  { href: "/customers", label: "客户", icon: "◎" },
  { href: "/chat", label: "AI教练", icon: "✦" },
  { href: "/me", label: "我的", icon: "☰" },
];

// 员工端：同样 5 导航，员工也能进客户机会池（/customers 按 data_scope 只看自己负责的）
// 「任务」不放底部，收进首页/我的
export const STAFF_NAV: NavItem[] = [
  { href: "/work", label: "首页", icon: "⌂" },
  { href: "/meeting", label: "会谈", icon: "◉" },
  { href: "/customers", label: "客户", icon: "◎" },
  { href: "/chat", label: "AI教练", icon: "✦" },
  { href: "/me", label: "我的", icon: "☰" },
];

// 兼容旧引用
export const ADMIN_NAV = MAIN_NAV;

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const exact = ["/admin", "/chat", "/work"];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-[var(--line)] bg-white/95 px-2 backdrop-blur"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <ul className="flex py-1.5">
        {items.map((it) => {
          const active = exact.includes(it.href) ? pathname === it.href : pathname.startsWith(it.href);
          return (
            <li key={it.href} className="flex-1">
              <Link
                href={it.href}
                className={`mx-0.5 flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] transition ${
                  active
                    ? "bg-[var(--green-soft)] font-medium text-[var(--green-dark)]"
                    : "text-[var(--faint)]"
                }`}
              >
                <span className="text-[17px] not-italic leading-none">{it.icon}</span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
