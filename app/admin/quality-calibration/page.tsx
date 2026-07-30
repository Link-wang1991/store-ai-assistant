"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BottomNav, MAIN_NAV } from "@/components/BottomNav";
import { AppLoading } from "@/components/AppLoading";
import { decodeJwtPayload } from "@/lib/jwt";
import { getToken, meetingApi } from "@/lib/api-client";
import { useRouter } from "next/navigation";

const reasonLabel: Record<string, string> = { need_discovery: "需求挖掘", deal_progress: "成交推进", service_experience: "服务体验", compliance: "合规表现", transcript_quality: "转写质量", other: "其他" };

export default function QualityCalibrationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<any>(null);
  const load = useCallback(async () => {
    const payload = decodeJwtPayload(getToken() || "");
    if (!payload) { router.replace("/login"); return; }
    if (!["owner", "manager", "admin"].includes(String(payload.role || ""))) { router.replace("/home"); return; }
    setLoading(true);
    const result = await meetingApi.qualityCalibration();
    if (!result.ok) setError(result.error || "评分校准数据读取失败");
    else setData(result.data);
    setLoading(false);
  }, [router]);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <AppLoading label="正在读取评分校准样本…" />;
  const metrics = [
    ["人工复核样本", data?.sample_size ?? 0, "至少 10 场后才给出趋势判断"],
    ["自动评分均值", data?.automatic_average ?? "—", "仅已被人工复核的会谈"],
    ["人工评分均值", data?.manual_average ?? "—", "不覆盖自动评分或合规结论"],
    ["平均绝对偏差", data?.mean_absolute_gap ?? "—", "自动分与人工分相差多少分"],
    ["同档一致率", data?.same_band_rate == null ? "—" : `${data.same_band_rate}%`, "同落在 0/25/50/75/100 的比例"],
  ];
  return <div className="ref-app"><div className="ref-canvas"><header className="ref-topbar"><Link href="/admin" className="ref-icon-button" aria-label="返回管理">←</Link><div><h1 className="text-[17px] font-bold text-[#161d17]">会谈评分校准</h1><p className="text-[10px] text-[#738077]">只统计真实人工复核样本，不使用演示数据推导准确率</p></div></header><main className="ref-main space-y-3 pb-8">{error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}<section className="ref-card p-4"><h2 className="text-[15px] font-bold text-[#172119]">评分口径</h2><p className="mt-2 text-[12px] leading-relaxed text-[#526152]">自动评分由需求挖掘 25%、成交推进 30%、合规表现 20%、服务体验 25% 加权；命中 L3/L4 合规风险会被上限/归零。店长可按同一 0/25/50/75/100 量表复核，偏差只用于校准，不会改写原始转写或风险结论。</p></section><section className="grid grid-cols-2 gap-2">{metrics.map(([label, value, hint]) => <div key={String(label)} className="ref-card p-3"><p className="text-[11px] text-[#738077]">{label}</p><p className="mt-1 text-xl font-bold text-[#172119]">{value}</p><p className="mt-1 text-[10px] leading-relaxed text-[#879388]">{hint}</p></div>)}</section><section className="ref-card p-4"><h2 className="text-[15px] font-bold text-[#172119]">如何解读</h2><p className="mt-2 text-[12px] leading-relaxed text-[#526152]">{data?.interpretation || "暂无样本。请先在会谈详情完成店长人工复核。"}</p><p className="mt-2 text-[10px] leading-relaxed text-[#879388]">{data?.method}</p></section><section className="ref-card p-4"><h2 className="text-[15px] font-bold text-[#172119]">偏差原因分布</h2>{Object.keys(data?.reason_counts || {}).length ? <div className="mt-3 flex flex-wrap gap-2">{Object.entries(data.reason_counts).map(([key, value]) => <span key={key} className="rounded-full bg-[#edf7ee] px-2.5 py-1 text-[11px] text-[#17683a]">{reasonLabel[key] || key} · {String(value)}</span>)}</div> : <p className="mt-2 text-[12px] text-[#879388]">复核时选择“校准原因”后，这里才会形成真实分布。</p>}</section><section className="ref-card p-4"><h2 className="text-[15px] font-bold text-[#172119]">最近复核样本</h2>{(data?.recent_reviews || []).length === 0 ? <p className="mt-2 text-[12px] text-[#879388]">暂无人工复核样本。</p> : <div className="mt-3 space-y-2">{data.recent_reviews.map((item: any) => <Link href={`/meeting/${encodeURIComponent(item.meeting_id)}`} key={item.meeting_id} className="block rounded-xl border border-[#d8e6da] bg-[#f7fbf6] p-3"><div className="flex items-center justify-between gap-2"><b className="text-[12px] text-[#253126]">{item.customer_name || "未命名客户"} · {item.employee_name || "员工"}</b><span className="text-[11px] text-[#006d37]">查看会谈 ›</span></div><p className="mt-1 text-[11px] text-[#526152]">自动 {item.automatic_score} 分 · 人工 {item.review_score} 分 · 偏差 {item.gap} 分</p>{item.reason_codes?.length > 0 && <p className="mt-1 text-[10px] text-[#738077]">{item.reason_codes.map((key: string) => reasonLabel[key] || key).join("、")}</p>}</Link>)}</div>}</section></main></div><BottomNav items={MAIN_NAV} activeHref="/me" /></div>;
}
