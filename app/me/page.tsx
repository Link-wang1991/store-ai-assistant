"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/api-client";
import { LogoutButton } from "@/components/LogoutButton";
import { BottomNav, MAIN_NAV, STAFF_NAV } from "@/components/BottomNav";
import { decodeJwtPayload } from "@/lib/jwt";
import { AppLoading } from "@/components/AppLoading";

export default function MePage() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = getToken();
    if (!t) { router.replace("/login"); return; }
    const p = decodeJwtPayload(t);
    if (!p) { router.replace("/login"); return; }
    setRole(p.role || "");
    setName(p.role === "owner" ? "老板" : p.role === "manager" ? "店长" : p.role === "consultant" ? "咨询师" : p.role === "beautician" ? "美容师" : p.role === "receptionist" ? "前台" : p.role === "operator" ? "运营" : "");
    setLoading(false);
  }, [router]);

  if (loading) return <AppLoading label="正在加载个人中心…" />;

  const isAdmin = role === "owner" || role === "admin" || role === "manager";
  const nav = isAdmin ? MAIN_NAV : STAFF_NAV;

  return (
    <div className="me-page min-h-screen pb-20">
      <header className="me-header flex items-center justify-between px-4 py-4">
        <div>
          <div className="text-[20px] font-semibold tracking-tight text-[#172119]">{name}</div>
          <div className="mt-0.5 text-xs text-[#718077]">{role === "owner" ? "老板" : role === "manager" ? "店长" : role === "consultant" ? "咨询师" : role === "beautician" ? "美容师" : role === "receptionist" ? "前台" : role === "operator" ? "运营" : role} · 门店 AI 经营助手</div>
        </div>
        <div className="me-avatar flex h-11 w-11 items-center justify-center rounded-full text-lg font-semibold">
          {name.slice(0, 1)}
        </div>
      </header>

      <div className="me-content space-y-7 p-4">
        <section>
          <div className="me-section-title">常用</div>
          <div className="grid grid-cols-4 gap-2.5">
            {[
              { href: "/chat", icon: "coach", label: "AI教练" },
              { href: "/meeting", icon: "meeting", label: "会谈" },
              { href: "/tasks", icon: "task", label: "我的任务" },
              { href: "/submit", icon: "submit", label: "提交问题" },
            ].map((it) => (
              <Link key={it.href} href={it.href} className="me-shortcut flex flex-col items-center text-center">
                <MeShortcutIcon name={it.icon} />
                <span className="mt-1.5 text-[11px] text-[#66756b]">{it.label}</span>
              </Link>
            ))}
          </div>
        </section>

        {isAdmin && (
          <section>
            <div className="me-section-title">管理</div>
            <Link href="/admin" className="me-management-card flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span className="me-management-icon flex h-9 w-9 items-center justify-center rounded-full">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63a1.7 1.7 0 0 0 1-1.55V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9a1.7 1.7 0 0 0 1.55 1H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
                  </svg>
                </span>
                <div>
                  <div className="text-sm font-semibold text-[#243128]">管理后台</div>
                  <div className="mt-0.5 text-xs text-[#91a095]">员工、知识库、权限、数据看板</div>
                </div>
              </div>
              <ChevronRightIcon />
            </Link>
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

function MeShortcutIcon({ name }: { name: string }) {
  const common = {
    className: "h-5 w-5 text-[#087f5b]",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "coach") {
    return <svg viewBox="0 0 24 24" {...common}><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z" /><path d="m18.2 14.4.8 2.3 2.3.8-2.3.8-.8 2.3-.8-2.3-2.3-.8 2.3-.8.8-2.3Z" /></svg>;
  }
  if (name === "meeting") {
    return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="7" /><path d="M9 9.5a3.7 3.7 0 0 1 6 0M9 14.5c.8.7 1.8 1.1 3 1.1s2.2-.4 3-1.1" /></svg>;
  }
  if (name === "task") {
    return <svg viewBox="0 0 24 24" {...common}><path d="m5 12 4 4L19 6" /></svg>;
  }
  return <svg viewBox="0 0 24 24" {...common}><path d="m4 20 4.1-1 10.4-10.4a2.1 2.1 0 0 0-3-3L5.1 16 4 20Z" /><path d="m13.8 7.2 3 3" /></svg>;
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#9eafa1]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
