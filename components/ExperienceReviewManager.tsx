"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { experienceReviewApi, type ExperienceReviewItem } from "@/lib/api-client";
import { AppLoading } from "@/components/AppLoading";

const ROLE_OPTIONS = [
  { key: "owner", label: "老板" },
  { key: "manager", label: "店长" },
  { key: "consultant", label: "咨询师" },
  { key: "beautician", label: "美容师" },
  { key: "receptionist", label: "前台" },
  { key: "operator", label: "运营" },
];

function candidateContent(value: string) {
  const marker = "【待审核内容】";
  const scriptMarker = "【建议话术】";
  const practiceMarker = "【值得复制的做法】";
  const firstContentMarker = value.indexOf(scriptMarker) >= 0
    ? value.indexOf(scriptMarker)
    : value.indexOf(practiceMarker);
  const startAt = value.indexOf(marker) >= 0
    ? value.indexOf(marker) + marker.length
    : Math.max(0, firstContentMarker);
  const endAt = value.indexOf("\n\n请审核：", startAt);
  return value.slice(startAt, endAt >= 0 ? endAt : value.length).trim();
}

function documentTitle(value: string) {
  return (value || "会谈经验").replace(/^审核会谈经验：/, "会谈经验 · ");
}

function suggestedCategory(value: string) {
  const match = /(?:^|\n)建议分类：([^\n]+)/.exec(value || "");
  return match?.[1]?.trim() || "会谈沉淀";
}

export function ExperienceReviewManager() {
  const [items, setItems] = useState<ExperienceReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("会谈沉淀");
  const [content, setContent] = useState("");
  const [visibleRoles, setVisibleRoles] = useState<string[]>(["owner", "manager", "consultant", "beautician", "receptionist", "operator"]);
  const [rejectReason, setRejectReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const active = useMemo(() => items.find((item) => item.id === activeId) || null, [items, activeId]);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await experienceReviewApi.listPending();
    if (result.ok) {
      setItems(result.data || []);
    } else {
      setNotice(result.error || "读取审核队列失败");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  function select(item: ExperienceReviewItem) {
    setActiveId(item.id);
    setTitle(documentTitle(item.title));
    setCategory(suggestedCategory(item.content));
    setContent(candidateContent(item.content));
    setVisibleRoles(["owner", "manager", "consultant", "beautician", "receptionist", "operator"]);
    setRejectReason("");
    setNotice("");
  }

  function toggleRole(role: string) {
    setVisibleRoles((current) => current.includes(role)
      ? current.filter((value) => value !== role)
      : [...current, role]);
  }

  async function approve() {
    if (!active || saving) return;
    if (!title.trim() || !content.trim()) {
      setNotice("请先填写知识标题和审核后的正文");
      return;
    }
    if (visibleRoles.length === 0) {
      setNotice("请至少选择一个可见岗位");
      return;
    }
    setSaving(true);
    const result = await experienceReviewApi.approve(active.id, {
      title: title.trim(), category: category.trim(), content: content.trim(), visibleRoles,
    });
    setSaving(false);
    if (!result.ok) {
      setNotice(result.error || "审核通过失败");
      return;
    }
    setNotice("已发布为正式知识库内容，并保留审核和来源记录。");
    setActiveId(null);
    await load();
  }

  async function reject() {
    if (!active || saving) return;
    if (!rejectReason.trim()) {
      setNotice("请写明驳回原因，方便提交人改进后再次提交");
      return;
    }
    setSaving(true);
    const result = await experienceReviewApi.reject(active.id, rejectReason.trim());
    setSaving(false);
    if (!result.ok) {
      setNotice(result.error || "驳回失败");
      return;
    }
    setNotice("已驳回；内容未进入知识库，驳回原因已留存。");
    setActiveId(null);
    await load();
  }

  if (loading) return <AppLoading label="正在读取经验审核队列…" />;

  return (
    <div className="min-h-screen bg-[var(--page)] pb-10">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-white px-4 py-3">
        <div className="relative flex items-center justify-center">
          <Link href="/admin" className="absolute left-0 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--ink)]" aria-label="返回管理页">←</Link>
          <div className="text-center"><h1 className="text-[16px] font-semibold text-[var(--ink)]">待审核经验</h1><p className="mt-0.5 text-[10px] text-[var(--faint)]">通过后才会发布到正式知识库</p></div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-3 p-4">
        <div className="rounded-2xl border border-[var(--green-light)] bg-[var(--green-soft)] p-3 text-[12px] leading-relaxed text-[var(--muted)]">
          审核前请核对原会谈与逐字稿，删除客户隐私、夸大承诺和只适用于单个客户的信息。发布后的内容会成为全店 AI 可引用的正式知识。
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white p-10 text-center text-[13px] text-[var(--faint)]">暂时没有待审核的会谈经验</div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <section className="space-y-2">
              {items.map((item) => (
                <button key={item.id} onClick={() => select(item)} className={`w-full rounded-2xl border bg-white p-3.5 text-left transition ${activeId === item.id ? "border-[var(--green)] shadow-sm" : "border-[var(--line)] hover:border-[var(--green-light)]"}`}>
                  <div className="text-[13px] font-semibold text-[var(--ink)]">{documentTitle(item.title)}</div>
                  <div className="mt-1 text-[11px] text-[var(--muted)]">{item.submittedByName ? `提交人：${item.submittedByName}` : "会谈自动候选"}</div>
                  <div className="mt-1 text-[10px] text-[var(--faint)]">{item.createdAt || "刚刚提交"}</div>
                </button>
              ))}
            </section>

            <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
              {!active ? (
                <div className="flex min-h-64 items-center justify-center text-center text-[13px] text-[var(--faint)]">选择一条候选后，可编辑、通过或驳回。</div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
                    <div><div className="text-[14px] font-semibold text-[var(--ink)]">审核并发布</div><div className="mt-0.5 text-[10px] text-[var(--faint)]">来源、审核人和审核时间将随正式知识保留</div></div>
                    {active.sourceMeetingId && <Link href={`/meeting/${active.sourceMeetingId}`} className="rounded-full border border-[var(--green-light)] px-3 py-1.5 text-[11px] font-medium text-[var(--green-dark)]">查看原会谈 ↗</Link>}
                  </div>

                  <label className="block text-[11px] font-medium text-[var(--muted)]">知识标题<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--green)]" /></label>
                  <label className="block text-[11px] font-medium text-[var(--muted)]">知识分类<input value={category} onChange={(event) => setCategory(event.target.value)} maxLength={60} className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--green)]" /></label>
                  <label className="block text-[11px] font-medium text-[var(--muted)]">审核后的正文<textarea value={content} onChange={(event) => setContent(event.target.value)} rows={11} maxLength={12000} className="mt-1.5 w-full resize-y rounded-xl border border-[var(--line)] px-3 py-2 text-[13px] leading-relaxed text-[var(--ink)] outline-none focus:border-[var(--green)]" /></label>

                  <fieldset><legend className="text-[11px] font-medium text-[var(--muted)]">可见岗位</legend><div className="mt-1.5 flex flex-wrap gap-1.5">{ROLE_OPTIONS.map((role) => <button type="button" key={role.key} onClick={() => toggleRole(role.key)} className={`rounded-full border px-2.5 py-1 text-[11px] ${visibleRoles.includes(role.key) ? "border-[var(--green)] bg-[var(--green-soft)] text-[var(--green-dark)]" : "border-[var(--line)] text-[var(--muted)]"}`}>{role.label}</button>)}</div></fieldset>

                  <label className="block text-[11px] font-medium text-[var(--muted)]">如需驳回，请写明原因<textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} rows={2} maxLength={1000} placeholder="例如：案例只适用于单个客户，需补充适用边界后再提交" className="mt-1.5 w-full resize-y rounded-xl border border-[var(--line)] px-3 py-2 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--green)]" /></label>

                  <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--line)] pt-3"><button disabled={saving} onClick={reject} className="rounded-full border border-red-200 px-3.5 py-2 text-[12px] font-medium text-red-600 disabled:opacity-50">驳回</button><button disabled={saving} onClick={approve} className="rounded-full bg-[var(--green)] px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-50">{saving ? "处理中…" : "审核通过并发布"}</button></div>
                </div>
              )}
            </section>
          </div>
        )}
        {notice && <div role="status" className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-[12px] text-[var(--muted)]">{notice}</div>}
      </main>
    </div>
  );
}
