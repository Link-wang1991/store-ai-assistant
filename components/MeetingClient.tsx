"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Cust { id: string; name: string }

const SCENE_OPTIONS = [
  { key: "new_consult", label: "新客咨询" },
  { key: "project_intro", label: "项目介绍" },
  { key: "deal", label: "成交咨询" },
  { key: "pre_service", label: "服务前沟通" },
  { key: "in_service", label: "服务中沟通" },
  { key: "post_service", label: "服务后反馈" },
  { key: "return_visit", label: "老客复购" },
  { key: "complaint", label: "客诉处理" },
];

function fmtTimer(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function preferredAudioMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/aac",
    "audio/webm;codecs=opus", "audio/webm",
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

function audioExt(mime: string) {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("mpeg")) return "mp3";
  return "webm";
}

export function MeetingClient({ myCustomers, otherCustomers, onRefresh, onRecordingChange }: {
  myCustomers: Cust[];
  otherCustomers: Cust[];
  onRefresh?: () => void;
  onRecordingChange?: (recording: boolean) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"setup" | "recording" | "uploading" | "done">("setup");
  const [error, setError] = useState("");

  // setup 表单
  const [isNewCustomer, setIsNewCustomer] = useState(true);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [scene, setScene] = useState("new_consult");
  const [starting, setStarting] = useState(false);

  // 录音
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [procStatus, setProcStatus] = useState("");
  const [meetingId, setMeetingId] = useState<string | null>(null);

  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<any>(null);
  const meetingIdRef = useRef<string | null>(null);
  const elapsedRef = useRef(0);
  const startingRef = useRef(false);

  const filteredMy = useMemo(() => {
    if (!searchTerm) return myCustomers;
    const q = searchTerm.toLowerCase();
    return myCustomers.filter((c) => c.name.toLowerCase().includes(q));
  }, [myCustomers, searchTerm]);

  const filteredOthers = useMemo(() => {
    if (!searchTerm) return otherCustomers;
    const q = searchTerm.toLowerCase();
    return otherCustomers.filter((c) => c.name.toLowerCase().includes(q));
  }, [otherCustomers, searchTerm]);

  // beforeunload 保护：录音中离开页面会提示
  useEffect(() => {
    if (step !== "recording") return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [step]);

  // 清理
  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    if (mrRef.current && mrRef.current.state !== "inactive") {
      try { mrRef.current.stop(); } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  // 计时器
  useEffect(() => {
    if (step !== "recording" || paused) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = setInterval(() => {
      setElapsed(prev => { const n = prev + 1; elapsedRef.current = n; return n; });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [step, paused]);

  async function startMeeting() {
    if (startingRef.current || step !== "setup") return;
    startingRef.current = true;
    setStarting(true);
    setError("");

    try {
      if (!isNewCustomer && !customerId) { setError("请选择客户"); return; }

      // HTTP 检查
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setError("当前是 http 访问，浏览器禁用了麦克风。录音需要 HTTPS。");
        return;
      }

      // 请求麦克风
      let stream: MediaStream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch {
        setError("麦克风权限被拒绝。请在浏览器允许麦克风后再试。");
        return;
      }
      streamRef.current = stream;

      // 创建会谈
      const effectiveName = isNewCustomer && !customerName.trim()
        ? (() => {
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, "0");
            return `新客户 ${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
          })()
        : customerName.trim();

      // 走前端 API 路由创建会谈（兼容双模式）
      const createRes = await fetch("/api/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: isNewCustomer ? "" : customerId,
          customerName: effectiveName,
          scene,
          consent: true,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || "创建会谈失败");
      const mid = createData.meetingId;
      setMeetingId(mid);
      meetingIdRef.current = mid;

      // 初始化录音
      const mime = preferredAudioMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mrRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        doUpload(blob, mid);
      };
      mr.start(1000);
      setElapsed(0);
      elapsedRef.current = 0;
      setPaused(false);
      setStep("recording");
      onRecordingChange?.(true);
    } catch (e: any) {
      setError(e.message);
      cleanup();
    } finally {
      setStarting(false);
      startingRef.current = false;
    }
  }

  function doStop() {
    if (mrRef.current && mrRef.current.state === "recording") {
      mrRef.current.stop();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // 不设置 false：录音上传中及完成后不显示会谈列表，用户点「返回」才恢复
  }

  async function doUpload(blob: Blob, mid: string) {
    setStep("uploading");
    setProcStatus("正在上传录音…");
    const ext = audioExt(blob.type);
    const form = new FormData();
    form.append("file", blob, `meeting-${mid}.${ext}`);
    form.append("duration", String(elapsedRef.current));

    try {
      const res = await fetch(`/api/meeting/${mid}/audio`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "上传失败");
      }
      setStep("done");
      setProcStatus("录音上传成功");
      onRefresh?.();
    } catch (e: any) {
      setError(e.message || "上传失败");
      setStep("setup");
      onRecordingChange?.(false);
      cleanup();
    }
  }

  // ── 渲染 ──

  // 录音中
  if (step === "recording") {
    return (
      <div className="px-4 pb-2 pt-3">
        <div className="rounded-2xl border border-[var(--green)] bg-white p-6 text-center">
          <div className="mx-auto mb-3 h-14 w-14 animate-pulse rounded-full bg-[var(--green-soft)] flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7 text-[var(--green)]">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
            </svg>
          </div>
          <div className="text-[32px] font-mono font-bold tracking-wider text-[var(--ink)]">{fmtTimer(elapsed)}</div>
          <p className="mt-1 text-[12px] text-[var(--faint)]">录音中，请勿切换页面</p>
          <div className="mt-6 flex justify-center gap-6">
            <button
              onClick={() => {
                const mr = mrRef.current;
                if (!mr) return;
                if (mr.state === "recording") { mr.pause(); clearInterval(timerRef.current); timerRef.current = null; setPaused(true); }
                else { mr.resume(); setPaused(false); }
              }}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--yellow-soft)] text-[var(--yellow)] active:scale-90 transition"
            >
              {paused ? (
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              )}
            </button>
            <button onClick={doStop} className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg active:scale-90 transition">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
            </button>
          </div>
          <p className="mt-3 text-[11px] text-[var(--faint)]">暂停 · 结束（红色方块）</p>
        </div>
      </div>
    );
  }

  // 上传中
  if (step === "uploading") {
    return (
      <div className="px-4 pb-2 pt-3">
        <div className="rounded-2xl border border-[var(--line)] bg-white p-6 text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--green)]" />
          <p className="text-[13px] text-[var(--muted)]">{procStatus}</p>
        </div>
      </div>
    );
  }

  // 上传完成
  if (step === "done") {
    return (
      <div className="px-4 pb-2 pt-3">
        <div className="rounded-2xl border border-[var(--green)] bg-white p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--green-soft)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6 text-[var(--green)]">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <p className="text-[14px] font-medium text-[var(--ink)]">录音已上传</p>
          <p className="mt-1 text-[12px] text-[var(--faint)]">转写完成后会自动生成分析报告</p>
          <div className="mt-4 flex justify-center gap-3">
            <button onClick={() => router.push(`/meeting/${meetingId}`)} className="rounded-full bg-[var(--green)] px-5 py-2 text-[13px] font-medium text-white">
              查看会谈详情
            </button>
            <button onClick={() => { setStep("setup"); setMeetingId(null); onRecordingChange?.(false); }} className="rounded-full border border-[var(--line)] px-5 py-2 text-[13px] text-[var(--muted)]">
              继续录制
            </button>
          </div>
        </div>
        <p className="mt-4 text-center">
          <button onClick={() => { window.location.href = "/meeting"; }} className="text-[12px] text-[var(--faint)] underline">
            返回会谈列表
          </button>
        </p>
      </div>
    );
  }

  // ── setup 表单 ──
  return (
    <div className="px-4 pb-2 pt-3">
      <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
        <h3 className="text-[14px] font-semibold text-[var(--ink)]">快速录音</h3>
        <p className="mt-0.5 text-[11px] text-[var(--faint)]">选好场景，点「开始」即可录制</p>

        {/* 新老切换 */}
        <div className="mt-3 flex gap-1 rounded-lg bg-[var(--page)] p-0.5">
          <button onClick={() => { setIsNewCustomer(true); setCustomerId(""); }} className={`flex-1 rounded-md py-1.5 text-[12px] font-medium transition ${isNewCustomer ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"}`}>新客户</button>
          <button onClick={() => setIsNewCustomer(false)} className={`flex-1 rounded-md py-1.5 text-[12px] font-medium transition ${!isNewCustomer ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"}`}>老客户</button>
        </div>

        <div className="mt-3 space-y-3">
          {isNewCustomer ? (
            <div>
              <label className="text-[12px] font-medium text-[var(--muted)]">客户姓名</label>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="输入客户姓名（留空自动生成）" className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--page)] px-3 py-2.5 text-[13px] outline-none focus:border-[var(--green)]" />
            </div>
          ) : (
            <div>
              <label className="text-[12px] font-medium text-[var(--muted)]">选择客户</label>
              <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="搜索客户名" className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--page)] px-3 py-2.5 text-[13px] outline-none focus:border-[var(--green)]" />
              {filteredMy.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-[10px] text-[var(--faint)]">我负责的</p>
                  <div className="flex flex-wrap gap-1.5">
                    {filteredMy.map((c) => (
                      <button key={c.id} onClick={() => { setCustomerId(c.id); setCustomerName(c.name); }} className={`rounded-full border px-2.5 py-1 text-[11px] transition ${customerId === c.id ? "border-[var(--green)] bg-[var(--green-soft)] text-[var(--green-dark)] font-medium" : "border-[var(--line)] bg-white text-[var(--muted)]"}`}>{c.name}</button>
                    ))}
                  </div>
                </div>
              )}
              {filteredOthers.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-[10px] text-[var(--faint)]">其他员工</p>
                  <div className="flex flex-wrap gap-1.5">
                    {filteredOthers.map((c) => (
                      <button key={c.id} onClick={() => { setCustomerId(c.id); setCustomerName(c.name); }} className={`rounded-full border px-2.5 py-1 text-[11px] transition ${customerId === c.id ? "border-[var(--green)] bg-[var(--green-soft)] text-[var(--green-dark)] font-medium" : "border-[var(--line)] bg-white text-[var(--muted)]"}`}>{c.name}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-[12px] font-medium text-[var(--muted)]">咨询场景</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {SCENE_OPTIONS.map((s) => (
                <button key={s.key} onClick={() => setScene(s.key)} className={`rounded-full border px-2.5 py-1 text-[11px] transition ${scene === s.key ? "border-[var(--green)] bg-[var(--green-soft)] text-[var(--green-dark)] font-medium" : "border-[var(--line)] bg-white text-[var(--muted)]"}`}>{s.label}</button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}

        <div className="mt-3 flex justify-end">
          <button onClick={startMeeting} disabled={starting} className="rounded-full bg-[var(--green)] px-5 py-2 text-[13px] font-medium text-white disabled:opacity-50">
            {starting ? "准备中…" : "开始会谈记录"}
          </button>
        </div>
      </div>
    </div>
  );
}
