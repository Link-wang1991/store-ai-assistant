"use client";

import { useState, useTransition } from "react";
import { experienceReviewApi } from "@/lib/api-client";

export interface ExperienceCandidate {
  title: string;
  content: string;
}

function DistillItem({ item, meetingId }: { item: ExperienceCandidate; meetingId: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  return (
    <div className="rounded-lg border border-[var(--line)] bg-white p-3">
      <div className="text-xs font-medium text-slate-700">{item.title}</div>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.content}</p>
      <div className="mt-2 flex justify-end">
        {done ? (
          <span className="text-[11px] font-medium text-[var(--green-dark)]">✓ 已提交管理审核</span>
        ) : (
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await experienceReviewApi.submit({
                  meetingId,
                  title: item.title,
                  content: item.content,
                  category: "会谈沉淀",
                });
                if (r.ok) setDone(true);
                else window.alert(r.error || "提交审核失败");
              })
            }
            className="rounded-lg bg-[var(--green-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--green-dark)] disabled:opacity-50"
          >
            {pending ? "提交中…" : "提交审核"}
          </button>
        )}
      </div>
    </div>
  );
}

export function ExperienceDistill({ candidates, meetingId }: { candidates: ExperienceCandidate[]; meetingId: string }) {
  if (candidates.length === 0) return null;
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white p-4">
      <div className="text-sm font-semibold text-slate-800">可提交审核的门店经验</div>
      <p className="mt-0.5 text-[11px] text-[var(--muted)]">提交后由店长/老板核对原会谈、编辑脱敏内容；审核通过才会进入正式知识库。</p>
      <div className="mt-2.5 space-y-2">
        {candidates.map((c, i) => (
          <DistillItem key={i} item={c} meetingId={meetingId} />
        ))}
      </div>
    </div>
  );
}
