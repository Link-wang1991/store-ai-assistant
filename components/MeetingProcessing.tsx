"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchWithRetry, readJson } from "@/lib/network/client-fetch";

// 报告页在"转写中/分析中"时挂载它：继续轮询推进状态机，
// 这样即使录音页前端中断（关页面/断网），从报告页打开也能接着把流程跑完。
export function MeetingProcessing({ id, initialStatus, onCompleted }: {
  id: string;
  initialStatus: string;
  onCompleted?: () => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState("");
  const [retrying, setRetrying] = useState(false);
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
          if (typeof d.message === "string" && d.message) setDetail(d.message);
          setNetworkFailures(0);
          if (d.status === "done") {
            onCompleted?.();
            router.refresh();
            return;
          }
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
  }, [id, onCompleted, router]);

  const label =
    status === "analyzing" ? "AI 正在复盘分析…" :
    status === "transcribing" ? "正在转写语音并区分说话人…" :
    status === "submitting" ? "正在安全提交转写任务…" :
    status === "queued" ? "录音已保存，等待提交转写…" : "处理中…";

  const retryTranscription = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      const res = await fetch(`/api/backend/api/meetings/${id}/retry-transcription`, { method: "POST" });
      const payload = await readJson(res);
      if (!res.ok || payload.code !== 200) throw new Error(payload.message || "重新提交转写失败");
      setError("");
      setDetail("已重新加入转写队列，录音无需重新上传。");
      setStatus("queued");
    } catch (e: any) {
      setError(e?.message || "重新提交转写失败");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      {error ? (
        <div className="text-center">
          <p className="text-sm text-red-500">⚠️ {error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 rounded-full border border-[var(--green)] px-4 py-1.5 text-[12px] font-medium text-[var(--green)]"
          >
            重新检查处理结果
          </button>
          <button
            type="button"
            onClick={retryTranscription}
            disabled={retrying}
            className="ml-2 mt-3 rounded-full bg-[var(--green)] px-4 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
          >
            {retrying ? "重新提交中…" : "重新提交转写"}
          </button>
          {error.includes("有效语音") && (
            <Link href="/meeting" className="ml-2 mt-3 inline-block rounded-full bg-[var(--green)] px-4 py-1.5 text-[12px] font-medium text-white">去重新录音</Link>
          )}
        </div>
      ) : (
        <>
          <div className="mb-3 h-9 w-9 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p className="text-sm font-medium text-slate-700">{label}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">{detail || (status === "queued" ? "录音已保存，正在排队提交语音识别任务…" : status === "submitting" ? "正在安全提交转写任务…" : status === "transcribing" ? "服务端会持续处理；离开本页后仍会继续。" : "完成后会自动显示报告，可停留在此页等待")}</p>
        </>
      )}
    </div>
  );
}
