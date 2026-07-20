"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchWithRetry, readJson } from "@/lib/network/client-fetch";

// 报告页在"转写中/分析中"时挂载它：继续轮询推进状态机，
// 这样即使录音页前端中断（关页面/断网），从报告页打开也能接着把流程跑完。
export function MeetingProcessing({ id, initialStatus }: { id: string; initialStatus: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState("");
  const [networkFailures, setNetworkFailures] = useState(0);

  useEffect(() => {
    let stop = false;
    (async () => {
      for (let i = 0; i < 180 && !stop; i++) {
        await new Promise((r) => setTimeout(r, Math.min(3000 + i * 250, 10000)));
        try {
          const res = await fetchWithRetry(`/api/meeting/${id}/status`, {
            retries: 2,
            timeoutMs: 20000,
          });
          const d = await readJson(res);
          if (d.status) setStatus(d.status);
          setNetworkFailures(0);
          if (d.status === "done") { router.refresh(); return; }
          if (d.status === "failed") { setError(d.error || "处理失败"); return; }
        } catch {
          setNetworkFailures((count) => {
            const next = count + 1;
            if (next >= 3) setError("暂时无法获取处理进度，请检查网络后刷新页面。");
            return next;
          });
        }
      }
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label =
    status === "analyzing" ? "AI 正在复盘分析…" :
    status === "transcribing" ? "正在转写语音并区分说话人…" : "处理中…";

  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      {error ? (
        <div className="text-center">
          <p className="text-sm text-red-500">⚠️ {error}</p>
          {error.includes("有效语音") && (
            <Link href="/meeting" className="mt-3 inline-block rounded-full bg-[var(--green)] px-4 py-1.5 text-[12px] font-medium text-white">去重新录音</Link>
          )}
        </div>
      ) : (
        <>
          <div className="mb-3 h-9 w-9 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p className="text-sm font-medium text-slate-700">{label}</p>
          <p className="mt-1 text-xs text-slate-400">{status === "queued" ? "录音已保存，正在排队提交语音识别任务…" : status === "submitting" ? "正在安全提交转写任务…" : "完成后会自动显示报告，可停留在此页等待"}</p>
        </>
      )}
    </div>
  );
}
