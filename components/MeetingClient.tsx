"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteMeeting } from "@/lib/actions";
import { MEETING_SCENES as SCENES } from "@/lib/scenes";
import { fetchWithRetry, readJson } from "@/lib/network/client-fetch";

const CONSENT_TEXT =
  "本次录音仅用于门店内部服务复盘、客户需求记录与后续服务优化，不对外公开。客户可随时要求停止录音或删除记录。";

interface Cust { id: string; name: string }

function fmtSec(s: number) {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function preferredAudioMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/aac",
    "audio/webm;codecs=opus",
    "audio/webm",
  ];
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) || "";
}

function audioExt(mime: string) {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("mpeg")) return "mp3";
  return "webm";
}

export function MeetingClient({ customers }: { customers: Cust[] }) {
  const router = useRouter();
  const [step, setStep] = useState<"setup" | "recording" | "processing">("setup");

  // setup
  const [custMode, setCustMode] = useState<"existing" | "new" | "temp">("existing");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [scene, setScene] = useState("new_consult");
  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);

  // recording
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [marks, setMarks] = useState<number[]>([]);
  const [procStatus, setProcStatus] = useState("");
  const [error, setError] = useState("");

  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<any>(null);
  // 这两个值会在 MediaRecorder.onstop / pollStatus 的旧闭包里被读取，必须用 ref 拿最新值
  const meetingIdRef = useRef<string | null>(null);
  const elapsedRef = useRef(0);
  const startingRef = useRef(false); // 同步锁：防止多次点击「开始」生成多条会谈
  const stoppingRef = useRef(false); // 同步锁：防止多次点击「结束」重复上传/重复转写

  function startTimer() {
    timerRef.current = setInterval(
      () => setElapsed((e) => { const n = e + 1; elapsedRef.current = n; return n; }),
      1000
    );
  }
  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  async function start() {
    // 防重复创建：进行中或已离开 setup，忽略多次点击（修复一次操作生成多条会谈）
    if (startingRef.current || step !== "setup") return;
    startingRef.current = true;
    setStarting(true);
    try {
      setError("");
      if (!consent) { setError("请先确认客户已同意录音"); return; }
      if (custMode === "existing" && !customerId) { setError("请选择客户"); return; }
      if (custMode === "new" && !customerName.trim()) { setError("请输入新客户姓名"); return; }
      // 麦克风需要安全上下文（HTTPS 或 localhost）。http 局域网访问时 mediaDevices 为 undefined。
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setError("当前是 http 访问，浏览器禁用了麦克风。录音需要 HTTPS：请用 ngrok / cloudflared 等生成一个 https 地址在手机打开，或部署到 https 环境后再录音。");
        return;
      }

      // 1) 先请求麦克风权限——用户拒绝/不可用就不创建会谈，避免留下空记录
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setError("麦克风权限被拒绝或不可用。请在浏览器允许麦克风后再点开始。");
        return;
      }
      streamRef.current = stream;

      // 2) 麦克风 OK 后才创建会谈
      let mid: string;
      try {
        const res = await fetchWithRetry("/api/meeting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: custMode === "existing" ? customerId : "",
            customerName: custMode === "new" ? customerName.trim() : "",
            scene,
            consent: true,
          }),
          retries: 0,
          timeoutMs: 30000,
        });
        const data = await readJson(res);
        if (!res.ok) throw new Error(data.error || "创建会谈失败");
        mid = data.meetingId;
      } catch (e: any) {
        stream.getTracks().forEach((t) => t.stop()); // 关掉麦克风
        setError(e.message || "创建会谈失败");
        return;
      }
      setMeetingId(mid);
      meetingIdRef.current = mid;
      elapsedRef.current = 0;

      // 3) 初始化 MediaRecorder——失败则停 stream 并回滚（删除刚建的空会谈）
      try {
        const mime = preferredAudioMime();
        const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        mrRef.current = mr;
        chunksRef.current = [];
        mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
        mr.onstop = onStop;
        mr.start(1000); // 每秒切片，降低异常丢失风险
      } catch (e: any) {
        stream.getTracks().forEach((t) => t.stop());
        deleteMeeting(mid).catch(() => {}); // 回滚空会谈
        setError("录音初始化失败：" + (e.message || "浏览器不支持录音"));
        return;
      }

      setElapsed(0); setMarks([]); setPaused(false);
      setStep("recording");
      startTimer();
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  function togglePause() {
    const mr = mrRef.current;
    if (!mr) return;
    if (paused) { mr.resume(); startTimer(); setPaused(false); }
    else { mr.pause(); stopTimer(); setPaused(true); }
  }

  function addMark() {
    setMarks((m) => [...m, elapsed]);
  }

  function finish() {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    stopTimer();
    const mr = mrRef.current;
    if (mr && mr.state !== "inactive") {
      mr.stop();
    } else {
      onStop();
    }
  }

  async function onStop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setStep("processing");
    setProcStatus("uploading");
    try {
      const mime = mrRef.current?.mimeType || "audio/webm";
      const ext = audioExt(mime);
      const blob = new Blob(chunksRef.current, { type: mime });
      const fd = new FormData();
      fd.append("file", blob, `meeting.${ext}`);
      fd.append("duration", String(elapsedRef.current));
      const res = await fetchWithRetry(`/api/meeting/${meetingIdRef.current}/audio`, {
        method: "POST",
        body: fd,
        retries: 2,
        timeoutMs: 0,
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "上传失败");
      pollStatus();
    } catch (e: any) {
      setError(e.message || "上传失败");
    }
  }

  async function pollStatus() {
    // 长录音转写可能较久：窗口约 40 分钟，间隔前期密后期疏
    for (let i = 0; i < 240; i++) {
      await new Promise((r) => setTimeout(r, Math.min(4000 + i * 300, 12000)));
      try {
        const res = await fetchWithRetry(`/api/meeting/${meetingIdRef.current}/status`, {
          retries: 2,
          timeoutMs: 20000,
        });
        const d = await readJson(res);
        if (d.status) setProcStatus(d.status);
        if (d.status === "done") { router.push(`/meeting/${meetingIdRef.current}`); return; }
        if (d.status === "failed") { setError("处理失败：" + (d.error || "")); return; }
      } catch {
        // 网络抖动，继续轮询
      }
    }
    setError("处理时间较长，可先离开，稍后在「我的会谈记录」里打开该会谈继续查看");
  }

  const inputCls = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";

  // ====== 渲染 ======
  if (step === "processing") {
    const label = procStatus === "analyzing" ? "AI 正在复盘分析…" : procStatus === "transcribing" ? "正在转写语音并区分说话人…" : "正在上传录音…";
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        {error ? (
          <>
            <div className="mb-3 text-3xl">⚠️</div>
            <p className="text-sm text-red-500">{error}</p>
            <button onClick={() => router.push("/meeting")} className="mt-4 rounded-full bg-brand px-4 py-2 text-sm text-white">返回</button>
          </>
        ) : (
          <>
            <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            <p className="text-sm font-medium text-slate-700">{label}</p>
            <p className="mt-1 text-xs text-slate-400">转写+分析需要一会儿，请勿关闭页面</p>
          </>
        )}
      </div>
    );
  }

  if (step === "recording") {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center p-6">
        <div className="mb-2 text-xs text-slate-400">{SCENES.find((s) => s[0] === scene)?.[1]} · 录音中</div>
        <div className={`mb-1 text-5xl font-bold tabular-nums ${paused ? "text-slate-400" : "text-brand"}`}>{fmtSec(elapsed)}</div>
        <div className="mb-6 flex items-center gap-1.5 text-xs text-slate-400">
          <span className={`h-2 w-2 rounded-full ${paused ? "bg-slate-300" : "animate-pulse bg-red-500"}`} />
          {paused ? "已暂停" : "正在录音"}
        </div>

        {marks.length > 0 && (
          <div className="mb-4 flex flex-wrap justify-center gap-1.5">
            {marks.map((m, i) => (
              <span key={i} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">⭐ {fmtSec(m)}</span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={togglePause} className="rounded-full border border-slate-300 px-5 py-2.5 text-sm text-slate-600">
            {paused ? "继续" : "暂停"}
          </button>
          <button onClick={addMark} className="rounded-full border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm text-amber-700">
            ⭐ 标记重点
          </button>
        </div>
        <button onClick={finish} className="mt-4 rounded-full bg-brand px-8 py-3 text-sm font-medium text-white">
          结束会谈
        </button>
        <p className="mt-6 text-center text-[11px] text-slate-300">录音结束后会自动转写并生成复盘报告</p>
      </div>
    );
  }

  // setup
  return (
    <div className="space-y-4 p-4">
      {/* 选客户 */}
      <div className="rounded-xl border border-[var(--line)] bg-white p-4">
        <div className="mb-2 text-sm font-semibold text-slate-700">👤 选择客户</div>
        <div className="mb-2 flex gap-2">
          {[["existing", "已有客户"], ["new", "新建客户"], ["temp", "临时客户"]].map(([k, l]) => (
            <button key={k} onClick={() => setCustMode(k as any)}
              className={`rounded-full px-3 py-1.5 text-xs ${custMode === k ? "bg-[var(--green-soft)] font-medium text-[var(--green-dark)]" : "border border-slate-200 text-slate-600"}`}>
              {l}
            </button>
          ))}
        </div>
        {custMode === "existing" && (
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputCls}>
            <option value="">请选择客户…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {custMode === "new" && (
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="新客户姓名" className={inputCls} />
        )}
        {custMode === "temp" && <p className="text-xs text-slate-400">临时客户：不建档，分析结果不写入客户档案。</p>}
      </div>

      {/* 选场景 */}
      <div className="rounded-xl border border-[var(--line)] bg-white p-4">
        <div className="mb-2 text-sm font-semibold text-slate-700">🎯 会谈场景</div>
        <div className="grid grid-cols-4 gap-2">
          {SCENES.map(([k, l]) => (
            <button key={k} onClick={() => setScene(k)}
              className={`rounded-lg px-2 py-2 text-xs ${scene === k ? "bg-[var(--green-soft)] font-medium text-[var(--green-dark)]" : "border border-slate-200 text-slate-600"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* 同意 */}
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
        <label className="flex items-start gap-2 text-xs text-amber-800">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
          <span>我已向客户说明并取得同意：{CONSENT_TEXT}</span>
        </label>
      </div>

      {error && <p className="text-center text-xs text-red-500">{error}</p>}

      <button onClick={start} disabled={!consent || starting}
        className="w-full rounded-xl bg-brand py-3.5 text-sm font-medium text-white disabled:opacity-50">
        {starting ? "正在开始…请稍候，勿重复点击" : "开始会谈记录"}
      </button>
      <p className="text-center text-[11px] text-slate-300">点击后浏览器会请求麦克风权限，请允许</p>
    </div>
  );
}
