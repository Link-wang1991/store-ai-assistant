"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateOwnerDailyReport } from "@/lib/actions";

// 生成今日老板日报（调 server action，走 lib/ai 适配层；前端不接触模型 key）
export function DailyReportButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [report, setReport] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [err, setErr] = useState("");

  function gen() {
    start(async () => {
      setErr("");
      const r = await generateOwnerDailyReport();
      if (r.ok && r.data) {
        setReport(r.data.text);
        setDate(r.data.date);
        router.refresh(); // 刷新历史日报列表
      } else {
        setErr(r.message || "生成失败");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-700">📝 今日老板日报</div>
        <button
          onClick={gen}
          disabled={pending}
          className="rounded-full bg-brand px-3.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? "生成中…" : report ? "重新生成" : "生成日报"}
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-red-500">{err}</p>}
      {report ? (
        <>
          {date && <div className="mt-2 text-xs text-slate-400">{date}</div>}
          <div className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
            {report}
          </div>
        </>
      ) : (
        <p className="mt-2 text-xs text-slate-400">
          点「生成日报」让 AI 用大白话总结今天门店发生了什么，并给出明日建议（即使今天没数据也会给下一步建议）。
        </p>
      )}
    </div>
  );
}
