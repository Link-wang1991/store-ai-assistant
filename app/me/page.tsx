"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/api-client";
import { LogoutButton } from "@/components/LogoutButton";
import { BottomNav, MAIN_NAV, STAFF_NAV } from "@/components/BottomNav";
import { decodeJwtPayload } from "@/lib/jwt";

export default function MePage() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [name, setName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = getToken();
    if (!t) { router.replace("/login"); return; }
    const p = decodeJwtPayload(t);
    if (!p) { router.replace("/login"); return; }
    setRole(p.role || "");
    setStoreId(p.storeId || "");
    setName(p.role === "owner" ? "老板" : p.role === "manager" ? "店长" : p.role === "consultant" ? "咨询师" : p.role === "beautician" ? "美容师" : p.role === "receptionist" ? "前台" : p.role === "operator" ? "运营" : "");
    setLoading(false);
  }, [router]);

  if (loading) return null;

  const isAdmin = role === "owner" || role === "manager";
  const nav = isAdmin ? MAIN_NAV : STAFF_NAV;

  return (
    <div className="min-h-screen pb-16">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4">
        <div>
          <div className="text-[18px] font-semibold text-slate-900">{name}</div>
          <div className="text-xs text-slate-500">{role === "owner" ? "老板" : role === "manager" ? "店长" : role === "consultant" ? "咨询师" : role === "beautician" ? "美容师" : role === "receptionist" ? "前台" : role === "operator" ? "运营" : role} · 门店 AI 经营助手</div>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/10 text-lg font-semibold text-brand-dark">
          {name.slice(0, 1)}
        </div>
      </header>

      <div className="space-y-4 p-4">
        <section>
          <div className="mb-2 text-sm font-semibold text-slate-800">常用</div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { href: "/chat", icon: "✦", label: "AI教练" },
              { href: "/meeting", icon: "◉", label: "会谈" },
              { href: "/tasks", icon: "✓", label: "我的任务" },
              { href: "/submit", icon: "✎", label: "提交问题" },
            ].map((it) => (
              <Link key={it.href} href={it.href} className="flex flex-col items-center rounded-xl border border-slate-200 bg-white py-3.5 text-center">
                <span className="text-[19px] text-brand-dark">{it.icon}</span>
                <span className="mt-1.5 text-[11px] text-slate-500">{it.label}</span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-2 text-sm font-semibold text-slate-800">门店知识库</div>
          <Link href={isAdmin ? "/admin/knowledge" : "/knowledge"} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <div className="text-sm font-medium text-slate-800">项目资料 · 活动 · SOP · 话术</div>
              <div className="mt-0.5 text-xs text-slate-400">{isAdmin ? "维护这里，AI 的回答会更准" : "遇到问题先查这里"}</div>
            </div>
            <span className="text-slate-300">›</span>
          </Link>
        </section>

        {isAdmin && (
          <section>
            <div className="mb-2 text-sm font-semibold text-slate-800">管理设置</div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { href: "/admin/employees", icon: "◍", label: "员工账号" },
                { href: "/admin/knowledge", icon: "▤", label: "知识库" },
                { href: "/admin/roles", icon: "⚷", label: "权限" },
                { href: "/settings/ai", icon: "✦", label: "AI模型" },
              ].map((l) => (
                <Link key={l.href} href={l.href} className="flex flex-col items-center rounded-xl border border-slate-200 bg-white py-3.5 text-center">
                  <span className="text-[17px] text-slate-400">{l.icon}</span>
                  <span className="mt-1.5 text-[11px] text-slate-500">{l.label}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="pt-2 text-center">
          <LogoutButton />
        </div>
      </div>
      <BottomNav items={nav} />
    </div>
  );
}
