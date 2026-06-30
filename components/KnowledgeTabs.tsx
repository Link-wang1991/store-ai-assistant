"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/knowledge/upload", label: "上传资料" },
  { href: "/admin/knowledge", label: "资料列表" },
  { href: "/admin/knowledge/gaps", label: "知识库缺口" },
  { href: "/admin/knowledge/standard", label: "标准答案" },
  { href: "/admin/knowledge/banned", label: "禁用词" },
];

export function KnowledgeTabs() {
  const pathname = usePathname();
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-slate-200/70 bg-white px-3 py-2">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs transition ${
              active
                ? "border-brand/30 bg-brand/5 font-medium text-brand-dark"
                : "border-slate-200/70 bg-white text-slate-500 hover:border-slate-300"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
