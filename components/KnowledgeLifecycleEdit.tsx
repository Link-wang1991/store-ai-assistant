"use client";

import { useState } from "react";
import { knowledgeApi } from "@/lib/api-client";

function toDate(value?: string | null) { return value ? String(value).slice(0, 10) : ""; }

/** 管理资料可检索状态、版本、到期和复核周期。保存后由后端立即决定是否还能被检索。 */
export function KnowledgeLifecycleEdit({ document }: { document: any }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [reviewStatus, setReviewStatus] = useState(String(document.review_status || "approved"));
  const [effectiveAt, setEffectiveAt] = useState(toDate(document.effective_at));
  const [expiresAt, setExpiresAt] = useState(toDate(document.expires_at));
  const [reviewDueAt, setReviewDueAt] = useState(toDate(document.review_due_at));
  const [versionLabel, setVersionLabel] = useState(String(document.version_label || ""));
  const [reviewNote, setReviewNote] = useState(String(document.review_note || ""));
  const statusLabel: Record<string, string> = { draft: "草稿（不参与检索）", approved: "已核准（可参与检索）", needs_review: "待复核（不参与检索）", retired: "已归档（不参与检索）" };

  async function save() {
    setSaving(true); setMessage("");
    const result = await knowledgeApi.updateLifecycle(document.id, { reviewStatus, effectiveAt, expiresAt, reviewDueAt, versionLabel, reviewNote });
    setSaving(false);
    if (!result.ok) { setMessage(result.error || "生命周期保存失败"); return; }
    setMessage("已保存。资料是否参与检索已按当前状态和有效期更新。");
  }

  return <div className="mt-2 rounded-lg border border-[#d8e6da] bg-[#f7fbf6] p-2.5 text-[11px]">
    <div className="flex items-center justify-between gap-2"><span className={reviewStatus === "approved" ? "font-medium text-[#17683a]" : "font-medium text-[#9b6500]"}>生命周期：{statusLabel[reviewStatus] || reviewStatus}</span><button type="button" onClick={() => setOpen((value) => !value)} className="text-[#006d37] underline underline-offset-2">{open ? "收起" : "管理"}</button></div>
    {!open ? <p className="mt-1 text-[#738077]">版本 {versionLabel || "未标注"} · {expiresAt ? `有效至 ${expiresAt}` : "未设置失效日期"} · {reviewDueAt ? `复核日 ${reviewDueAt}` : "未设置复核日"}</p> : <div className="mt-3 space-y-2"><label className="block text-[#526152]">检索状态<select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value)} className="mt-1 w-full rounded-md border border-[#cfe0d1] bg-white px-2 py-1.5"><option value="draft">草稿（不参与检索）</option><option value="approved">已核准（可参与检索）</option><option value="needs_review">待复核（不参与检索）</option><option value="retired">已归档（不参与检索）</option></select></label><div className="grid grid-cols-2 gap-2"><label className="text-[#526152]">生效日<input type="date" value={effectiveAt} onChange={(event) => setEffectiveAt(event.target.value)} className="mt-1 w-full rounded-md border border-[#cfe0d1] bg-white px-2 py-1.5" /></label><label className="text-[#526152]">失效日<input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="mt-1 w-full rounded-md border border-[#cfe0d1] bg-white px-2 py-1.5" /></label></div><div className="grid grid-cols-2 gap-2"><label className="text-[#526152]">下次复核<input type="date" value={reviewDueAt} onChange={(event) => setReviewDueAt(event.target.value)} className="mt-1 w-full rounded-md border border-[#cfe0d1] bg-white px-2 py-1.5" /></label><label className="text-[#526152]">版本<input value={versionLabel} maxLength={64} onChange={(event) => setVersionLabel(event.target.value)} placeholder="如 v2.1" className="mt-1 w-full rounded-md border border-[#cfe0d1] bg-white px-2 py-1.5" /></label></div><label className="block text-[#526152]">复核说明<textarea value={reviewNote} maxLength={2000} onChange={(event) => setReviewNote(event.target.value)} rows={2} className="mt-1 w-full rounded-md border border-[#cfe0d1] bg-white px-2 py-1.5" /></label>{message && <p className={message.includes("失败") ? "text-red-600" : "text-[#17683a]"}>{message}</p>}<button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-[#007e43] px-3 py-2 font-semibold text-white disabled:opacity-60">{saving ? "保存中…" : "保存生命周期"}</button></div>}
  </div>;
}
