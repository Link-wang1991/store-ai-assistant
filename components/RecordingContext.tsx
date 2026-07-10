"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api-client";
import { API_BASE_URL } from "@/lib/data-source";

function audioExt(mime: string) {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("mpeg")) return "mp3";
  return "webm";
}

// ================================================================
// 模块级单例 — 录音状态 + MediaRecorder 引用，不受 React 重挂载影响
// ================================================================

let storeState = { isRecording: false, isPaused: false, isStopping: false, timer: "00:00", meetingId: null as string | null };
let listeners: Array<() => void> = [];
let mrRef: MediaRecorder | null = null;
let streamRef: MediaStream | null = null;
let chunksRef: Blob[] = [];
let timerInterval: ReturnType<typeof setInterval> | null = null;
let elapsed = 0;

function notify() { listeners.forEach(l => l()); }
function getSnap() { return storeState; }

function cleanupStore() {
  streamRef?.getTracks().forEach(t => t.stop());
  if (timerInterval) clearInterval(timerInterval);
  mrRef = null; streamRef = null; chunksRef = []; timerInterval = null; elapsed = 0;
  storeState = { isRecording: false, isPaused: false, isStopping: false, timer: "00:00", meetingId: null };
  notify();
}

function makeOnStop(mid: string, router: any) {
  return async () => {
    storeState = { ...storeState, isStopping: true };
    notify();
    streamRef?.getTracks().forEach(t => t.stop());
    if (timerInterval) clearInterval(timerInterval);

    const blob = new Blob(chunksRef, { type: mrRef?.mimeType || "audio/webm" });
    const ext = audioExt(blob.type);
    const form = new FormData();
    form.append("file", blob, `meeting-${mid}.${ext}`);
    form.append("duration", String(elapsed));
    try { await fetch(`/api/meeting/${mid}/audio`, { method: "POST", body: form }); } catch {}

    cleanupStore();
    router.push(`/meeting/${mid}`);
  };
}

async function doStartRecording(opts: { isNewCustomer: boolean; customerId: string; customerName: string; scene: string }, router: any) {
  const { isNewCustomer, customerId, customerName, scene } = opts;
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, error: "当前是 http 访问，浏览器禁用了麦克风。录音需要 HTTPS。" };
  }
  try {
    const t = getToken();
    await fetch(`${API_BASE_URL}/api/meetings/batch-fail-recording`, { method: "POST", headers: { Authorization: `Bearer ${t}` } }).catch(() => {});

    const effectiveName = isNewCustomer && !customerName.trim()
      ? (() => { const now = new Date(); const p = (n: number) => String(n).padStart(2, "0"); return `新客户 ${p(now.getMonth()+1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`; })()
      : customerName.trim();

    const createRes = await fetch("/api/meeting", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: isNewCustomer ? "" : customerId, customerName: effectiveName, scene, consent: true }),
    });
    const createData = await createRes.json();
    if (!createRes.ok) throw new Error(createData.error || "创建会谈失败");
    const mid = createData.meetingId;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef = stream;
    const mr = new MediaRecorder(stream);
    mrRef = mr;
    chunksRef = [];
    elapsed = 0;

    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.push(e.data); };
    mr.onstop = makeOnStop(mid, router);
    mr.start(1000);

    timerInterval = setInterval(() => {
      elapsed++;
      const m = Math.floor(elapsed / 60); const s = elapsed % 60;
      storeState = { ...storeState, timer: `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` };
      notify();
    }, 1000);

    storeState = { isRecording: true, isPaused: false, isStopping: false, timer: "00:00", meetingId: mid };
    notify();
    return { ok: true };
  } catch (e: any) {
    cleanupStore();
    return { ok: false, error: e.message };
  }
}

function doPause() {
  if (mrRef && mrRef.state === "recording") {
    mrRef.pause();
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    storeState = { ...storeState, isPaused: true };
    notify();
  }
}

function doResume(router: any) {
  if (mrRef && mrRef.state === "paused") {
    mrRef.resume();
    timerInterval = setInterval(() => {
      elapsed++;
      const m = Math.floor(elapsed / 60); const s = elapsed % 60;
      storeState = { ...storeState, timer: `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` };
      notify();
    }, 1000);
    storeState = { ...storeState, isPaused: false };
    notify();
  }
}

function doStop() {
  if (mrRef && (mrRef.state === "recording" || mrRef.state === "paused")) mrRef.stop();
}

// ================================================================
// React Context + Provider
// ================================================================

interface RecordingContextValue {
  isRecording: boolean; isPaused: boolean; isStopping: boolean; timer: string; meetingId: string | null;
  startRecording: (opts: { isNewCustomer: boolean; customerId: string; customerName: string; scene: string }) => Promise<{ ok: boolean; error?: string }>;
  pauseRecording: () => void; resumeRecording: () => void; stopRecording: () => void;
}

const RecordingContext = createContext<RecordingContextValue | null>(null);

export function useRecording() {
  const ctx = useContext(RecordingContext);
  if (!ctx) throw new Error("useRecording must be used within RecordingProvider");
  return ctx;
}

export function RecordingProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const state = useSyncExternalStore(
    (cb) => { listeners.push(cb); return () => { listeners = listeners.filter(l => l !== cb); }; },
    getSnap, getSnap,
  );

  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (storeState.isRecording && mrRef) {
      // 组件重挂载后恢复 MediaRecorder 引用（已在模块级存活）
    }
  }, []);

  const startRecording = useCallback(async (opts: { isNewCustomer: boolean; customerId: string; customerName: string; scene: string }) => {
    return doStartRecording(opts, routerRef.current);
  }, []);

  const pauseRecording = useCallback(() => doPause(), []);
  const resumeRecording = useCallback(() => doResume(routerRef.current), []);
  const stopRecording = useCallback(() => doStop(), []);

  const value: RecordingContextValue = {
    isRecording: state.isRecording, isPaused: state.isPaused, isStopping: state.isStopping,
    timer: state.timer, meetingId: state.meetingId,
    startRecording, pauseRecording, resumeRecording, stopRecording,
  };

  return (
    <RecordingContext.Provider value={value}>
      {children}
      <GlobalRecordingBar />
    </RecordingContext.Provider>
  );
}

// ================================================================
// 全局浮动录音条 — 吸附 + 展开
// ================================================================

function GlobalRecordingBar() {
  const router = useRouter();
  const { isRecording, isPaused, isStopping, timer, pauseRecording, resumeRecording, stopRecording } = useRecording();
  const [expanded, setExpanded] = useState(false);

  if (!isRecording) return null;

  if (!expanded) {
    return (
      <div
        onClick={() => setExpanded(true)}
        style={{ position: "fixed", bottom: "130px", right: "12px", zIndex: 999999, cursor: "pointer" }}
        className="flex h-11 items-center gap-1.5 rounded-full bg-red-500 pr-3 pl-2 text-white shadow-lg transition-all active:scale-95"
      >
        <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
        <span className="text-[12px] font-mono font-medium">{timer}</span>
      </div>
    );
  }

  return (
    <div
      style={{ position: "fixed", bottom: "130px", left: "50%", transform: "translateX(-50%)", zIndex: 999999 }}
      className="flex items-center gap-2 rounded-2xl bg-red-500 px-3 py-2 text-white shadow-lg"
    >
      <button onClick={() => router.push("/meeting")} className="flex items-center gap-1.5 active:opacity-70">
        <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
        <span className="text-[13px] font-mono font-medium">{timer}</span>
      </button>
      {isStopping ? (
        <span className="text-[11px] text-white/70">上传中…</span>
      ) : (
        <div className="flex items-center gap-1.5">
          <button onClick={() => { isPaused ? resumeRecording() : pauseRecording(); }} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 active:bg-white/30">
            {isPaused ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            )}
          </button>
          <button onClick={() => { if (!isStopping) stopRecording(); }} disabled={isStopping} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 active:bg-white/30 disabled:opacity-50">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
          </button>
          <button onClick={() => setExpanded(false)} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 active:bg-white/20">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3"><path d="M18 15l-6-6-6 6"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}
