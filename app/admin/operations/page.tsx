"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLoading } from "@/components/AppLoading";
import { BottomNav, MAIN_NAV } from "@/components/BottomNav";
import { decodeJwtPayload } from "@/lib/jwt";
import { getToken, operationsApi } from "@/lib/api-client";

export default function OperationsPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const payload = decodeJwtPayload(getToken() || "");
    if (!payload) { router.replace("/login"); return; }
    if (!["owner", "manager", "admin"].includes(String(payload.role || ""))) { router.replace("/home"); return; }
    setLoading(true);
    const result = await operationsApi.overview();
    if (result.ok) setData(result.data); else setError(result.error || "运行监控读取失败");
    setLoading(false);
  }, [router]);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <AppLoading label="正在核对业务链路…" />;
  const summary = data?.summary || {};
  return <div className="ref-app"><div className="ref-canvas"><header className="ref-topbar"><Link href="/admin" className="ref-icon-button" aria-label="返回管理">←</Link><div><h1 className="text-[17px] font-bold text-[#161d17]">运行监控</h1><p className="text-[10px] text-[#738077]">录音、会谈闭环、知识生命周期与任务结果的真实异常</p></div><button onClick={() => void load()} className="ml-auto text-[12px] font-semibold text-[#007e43]">刷新</button></header><main className="ref-main space-y-3 pb-8">{error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}<section className="grid grid-cols-3 gap-2"><div className="ref-card p-3"><p className="text-[10px] text-[#738077]">严重</p><b className="mt-1 block text-xl text-red-600">{summary.critical || 0}</b></div><div className="ref-card p-3"><p className="text-[10px] text-[#738077]">需处理</p><b className="mt-1 block text-xl text-amber-600">{summary.warning || 0}</b></div><div className="ref-card p-3"><p className="text-[10px] text-[#738077]">全部异常</p><b className="mt-1 block text-xl text-[#172119]">{summary.total || 0}</b></div></section><section className="space-y-2">{(data?.items || []).map((item: any) => <article key={item.title} className={`rounded-2xl border bg-white p-4 ${item.severity === "critical" ? "border-red-200" : item.severity === "warning" ? "border-amber-200" : "border-[#d8e6da]"}`}><div className="flex items-start justify-between gap-3"><div><h2 className="text-[14px] font-bold text-[#172119]">{item.title}</h2><p className="mt-1 text-[11px] leading-relaxed text-[#738077]">{item.detail}</p></div><b className={`text-2xl ${item.severity === "critical" ? "text-red-600" : item.severity === "warning" ? "text-amber-600" : "text-[#007e43]"}`}>{item.count}</b></div><Link href={item.href} className="mt-3 inline-block text-[11px] font-semibold text-[#007e43] underline underline-offset-2">查看并处理 ›</Link></article>)}</section><p className="px-1 text-[10px] leading-relaxed text-[#879388]">“0”表示此刻没有被该规则命中的异常，不等于外部模型、网络或设备绝对可用；录音、上传和 ASR 仍应在真实手机上完成验收。</p></main></div><BottomNav items={MAIN_NAV} activeHref="/me" /></div>;
}
