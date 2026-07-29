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
const MAX_AUDIO_BYTES = 60 * 1024 * 1024;
const MIN_AUDIO_BYTES = 1024;
const PENDING_AUDIO_DB = "store-ai-pending-meeting-audio";
const PENDING_AUDIO_STORE = "uploads";

type PendingAudioUpload = {
  meetingId: string;
  blob: Blob;
  duration: number;
  createdAt: number;
};

// IndexedDB 在页面跳转、网络短暂中断后仍可保留同一份录音；内存 Map 是
// Safari 私密模式或存储配额不足时的短暂兜底。
const pendingAudioMemory = new Map<string, PendingAudioUpload>();

function notify() { listeners.forEach(l => l()); }
function getSnap() { return storeState; }

function openPendingAudioDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(PENDING_AUDIO_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PENDING_AUDIO_STORE)) db.createObjectStore(PENDING_AUDIO_STORE, { keyPath: "meetingId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开本地录音暂存"));
  });
}

async function savePendingAudio(upload: PendingAudioUpload) {
  pendingAudioMemory.set(upload.meetingId, upload);
  try {
    const db = await openPendingAudioDb();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PENDING_AUDIO_STORE, "readwrite");
      tx.objectStore(PENDING_AUDIO_STORE).put(upload);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("本地录音暂存失败"));
      tx.onabort = () => reject(tx.error || new Error("本地录音暂存被取消"));
    });
    db.close();
  } catch {
    // 内存副本仍可支持当前浏览器会话内的重传。
  }
}

async function loadPendingAudio(meetingId: string): Promise<PendingAudioUpload | null> {
  const memory = pendingAudioMemory.get(meetingId);
  if (memory) return memory;
  try {
    const db = await openPendingAudioDb();
    if (!db) return null;
    const value = await new Promise<PendingAudioUpload | null>((resolve, reject) => {
      const request = db.transaction(PENDING_AUDIO_STORE, "readonly").objectStore(PENDING_AUDIO_STORE).get(meetingId);
      request.onsuccess = () => resolve((request.result as PendingAudioUpload | undefined) || null);
      request.onerror = () => reject(request.error || new Error("读取本地录音暂存失败"));
    });
    db.close();
    if (value) pendingAudioMemory.set(meetingId, value);
    return value;
  } catch {
    return null;
  }
}

async function clearPendingAudio(meetingId: string) {
  pendingAudioMemory.delete(meetingId);
  try {
    const db = await openPendingAudioDb();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PENDING_AUDIO_STORE, "readwrite");
      tx.objectStore(PENDING_AUDIO_STORE).delete(meetingId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("清理本地录音暂存失败"));
    });
    db.close();
  } catch {
    // 清理失败不影响已上传的会谈；下次读取会覆盖同一 meetingId。
  }
}

function cleanupStore() {
  streamRef?.getTracks().forEach(t => t.stop());
  if (timerInterval) clearInterval(timerInterval);
  mrRef = null; streamRef = null; chunksRef = []; timerInterval = null; elapsed = 0;
  storeState = { isRecording: false, isPaused: false, isStopping: false, timer: "00:00", meetingId: null };
  notify();
}

function recordingError(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "麦克风权限未开启。请在浏览器地址栏允许麦克风访问后重试。";
  if (name === "NotFoundError") return "未检测到可用麦克风。请检查设备后重试。";
  if (name === "NotReadableError") return "麦克风正被其他应用占用。请关闭其他录音/通话应用后重试。";
  return error instanceof Error && error.message ? error.message : "录音启动失败，请稍后重试。";
}

/** 仅用于录音根本未启动（例如麦克风被拒绝）。
 * 上传阶段的网络异常不能把会谈直接标失败：服务端可能已经收到音频，只是回包在路上丢失。
 */
async function markRecordingFailed(meetingId: string, reason: string) {
  const token = getToken();
  await fetch(`${API_BASE_URL}/api/meetings/${meetingId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ status: "failed", transcript_status: "failed", fail_reason: reason.slice(0, 240) }),
  }).catch(() => {});
}

async function uploadPendingAudio(upload: PendingAudioUpload) {
  const ext = audioExt(upload.blob.type);
  const form = new FormData();
  form.append("file", upload.blob, `meeting-${upload.meetingId}.${ext}`);
  form.append("duration", String(upload.duration));
  const token = getToken();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(`${API_BASE_URL}/api/meetings/${upload.meetingId}/audio`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.code !== 200) throw new Error(payload.message || "录音上传失败，请检查网络后重试。");
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("上传超过 2 分钟未完成。录音已保留在本设备，可在详情页重新上传。");
    }
    if (error instanceof TypeError) {
      throw new Error("上传连接中断。录音已保留在本设备，请恢复网络后在详情页重新上传。");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function retryPendingAudioUpload(meetingId: string): Promise<{ ok: boolean; error?: string }> {
  const upload = await loadPendingAudio(meetingId);
  if (!upload) return { ok: false, error: "本设备未找到可重传的录音。若曾清除浏览器数据，请重新录音。" };
  try {
    await uploadPendingAudio(upload);
    await clearPendingAudio(meetingId);
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "录音上传失败，请稍后重试。";
    return { ok: false, error: reason };
  }
}

function preferredRecorderOptions(stream: MediaStream): MediaRecorderOptions | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  const mimeType = candidates.find((value) => MediaRecorder.isTypeSupported(value));
  return mimeType ? { mimeType, audioBitsPerSecond: 64_000 } : undefined;
}

function makeOnStop(mid: string, router: any) {
  return async () => {
    storeState = { ...storeState, isStopping: true };
    notify();
    streamRef?.getTracks().forEach(t => t.stop());
    if (timerInterval) clearInterval(timerInterval);

    const blob = new Blob(chunksRef, { type: mrRef?.mimeType || "audio/webm" });
    let uploadError = "";
    try {
      if (blob.size < MIN_AUDIO_BYTES) throw new Error("录音内容过短或没有采集到声音，请重新录音。");
      if (blob.size > MAX_AUDIO_BYTES) throw new Error("录音文件超过 60MB，请缩短本次会谈后重新录音。");
      const upload: PendingAudioUpload = { meetingId: mid, blob, duration: elapsed, createdAt: Date.now() };
      await savePendingAudio(upload);
      await uploadPendingAudio(upload);
      await clearPendingAudio(mid);
    } catch (error) {
      uploadError = error instanceof Error ? error.message : "录音上传失败，请稍后重试。";
    } finally {
      cleanupStore();
      router.push(`/meeting/${mid}${uploadError ? `?uploadError=${encodeURIComponent(uploadError)}` : ""}`);
    }
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

    const createRes = await fetch(`${API_BASE_URL}/api/meetings`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      body: JSON.stringify({ customerId: isNewCustomer ? "" : customerId, customerName: effectiveName, scene, consent: true }),
    });
    const createData = await createRes.json();
    if (!createRes.ok || createData.code !== 200) throw new Error(createData.message || "创建会谈失败");
    const mid = createData.data?.id;
    if (!mid) throw new Error("创建会谈失败，请重试。");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (error) {
      await markRecordingFailed(mid, recordingError(error));
      throw new Error(recordingError(error));
    }
    streamRef = stream;
    const mr = new MediaRecorder(stream, preferredRecorderOptions(stream));
    mrRef = mr;
    chunksRef = [];
    elapsed = 0;

    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.push(e.data); };
    mr.onstop = makeOnStop(mid, router);
    mr.start(5000);

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
  hasPendingUpload: (meetingId: string) => Promise<boolean>;
  retryPendingUpload: (meetingId: string) => Promise<{ ok: boolean; error?: string }>;
  discardPendingUpload: (meetingId: string) => Promise<void>;
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
  const hasPendingUpload = useCallback(async (meetingId: string) => Boolean(await loadPendingAudio(meetingId)), []);
  const retryPendingUpload = useCallback((meetingId: string) => retryPendingAudioUpload(meetingId), []);
  const discardPendingUpload = useCallback((meetingId: string) => clearPendingAudio(meetingId), []);

  const value: RecordingContextValue = {
    isRecording: state.isRecording, isPaused: state.isPaused, isStopping: state.isStopping,
    timer: state.timer, meetingId: state.meetingId,
    startRecording, pauseRecording, resumeRecording, stopRecording,
    hasPendingUpload, retryPendingUpload, discardPendingUpload,
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
