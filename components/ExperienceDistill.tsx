"use client";

import { useState, useTransition } from "react";
import { saveStoreExperience } from "@/lib/actions";

export interface ExperienceCandidate {
  title: string;
  content: string;
}

function DistillItem({ item }: { item: ExperienceCandidate }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  return (
    <div className="rounded-lg border border-[var(--line)] bg-white p-3">
      <div className="text-xs font-medium text-slate-700">{item.title}</div>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.content}</p>
      <div className="mt-2 flex justify-end">
        {done ? (
          <span className="text-[11px] font-medium text-[var(--green-dark)]">✓ 已沉淀到门店经验</span>
        ) : (
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveStoreExperience(item.title, item.content);
                if (r.ok) setDone(true);
                else window.alert(r.message);
              })
            }
            className="rounded-lg bg-[var(--green-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--green-dark)] disabled:opacity-50"
          >
            {pending ? "…" : "确认沉淀"}
          </button>
        )}
      </div>
    </div>
  );
}

export function ExperienceDistill({ candidates }: { candidates: ExperienceCandidate[] }) {
  if (candidates.length === 0) return null;
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white p-4">
      <div className="text-sm font-semibold text-slate-800">可沉淀为门店经验</div>
      <p className="mt-0.5 text-[11px] text-[var(--muted)]">把这次复盘里可复用的做法存进门店经验，全店 AI 后续都能用上</p>
      <div className="mt-2.5 space-y-2">
        {candidates.map((c, i) => (
          <DistillItem key={i} item={c} />
        ))}
      </div>
    </div>
  );
}
