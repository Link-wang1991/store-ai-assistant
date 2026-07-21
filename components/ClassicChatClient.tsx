"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RISK_LEVEL_COLORS, type RiskLevel } from "@/lib/constants";
import { chatApi } from "@/lib/api-client";
import { submitAiFeedback } from "@/lib/actions";
import { CoachModeTabs } from "@/components/CoachModeTabs";

interface SessionItem { id: string; title?: string | null; customerId?: string | null; }
interface Msg {
  id: string;
  role: "user" | "ai";
  text: string;
  riskLevel?: string | null;
  answerType?: string | null;
}

const ANSWER_TYPE_LABEL: Record<string, string> = {
  knowledge: "门店知识库",
  general: "通用建议",
  need_confirm: "待确认",
  risk: "高风险·已升级",
};
const ANALYSIS_MARKER = "===ANALYSIS===";

function inlineText(text: string, keyPrefix: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={`${keyPrefix}-${index}`} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>
      : <span key={`${keyPrefix}-${index}`}>{part}</span>,
  );
}

function ClassicRichText({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      {text.split("\n").map((line, index) => {
        const value = line.trim();
        if (!value) return <div key={index} className="h-1.5" />;
        const bullet = /^[-•·①②③④⑤⑥⑦⑧⑨⑩]/.test(value) || /^\d+[.)、]/.test(value);
        if (!bullet) return <div key={index}>{inlineText(value, `line-${index}`)}</div>;
        const content = value.replace(/^[-•·①②③④⑤⑥⑦⑧⑨⑩]\s*/, "").replace(/^\d+[.)、]\s*/, "");
        return <div key={index} className="flex gap-1.5"><span className="mt-px shrink-0 text-[var(--green-dark)]">·</span><span>{inlineText(content, `line-${index}`)}</span></div>;
      })}
    </div>
  );
}

function ClassicAiBubble({ message, onFeedback }: { message: Msg; onFeedback: (messageId: string, helpful: boolean) => void }) {
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [feedback, setFeedback] = useState<"" | "helpful" | "notHelpful">("");
  const markerAt = message.text.indexOf(ANALYSIS_MARKER);
  const answer = markerAt >= 0 ? message.text.slice(0, markerAt).trim() : message.text;
  const analysis = markerAt >= 0 ? message.text.slice(markerAt + ANALYSIS_MARKER.length).trim() : "";

  const markFeedback = (helpful: boolean) => {
    if (feedback) return;
    setFeedback(helpful ? "helpful" : "notHelpful");
    onFeedback(message.id, helpful);
  };

  return (
    <div className="flex justify-start">
      <div className="max-w-[88%]">
        <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2.5 text-sm leading-relaxed text-slate-800">
          <ClassicRichText text={answer} />
        </div>
        {analysis && (
          <div className="mt-1.5 pl-1">
            <button onClick={() => setAnalysisOpen((open) => !open)} className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/5 px-2.5 py-1 text-[11px] font-medium text-brand-dark">
              {analysisOpen ? "▴ 收起分析" : "📋 分析思路与策略"}
            </button>
            {analysisOpen && <div className="mt-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600"><ClassicRichText text={analysis} /></div>}
          </div>
        )}
        {(message.answerType || (message.riskLevel && message.riskLevel !== "L1")) && (
          <div className="mt-1 flex gap-1.5 pl-1">
            {message.answerType && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{ANSWER_TYPE_LABEL[message.answerType] || message.answerType}</span>}
            {message.riskLevel && message.riskLevel !== "L1" && <span className={`rounded-full px-2 py-0.5 text-[10px] ${RISK_LEVEL_COLORS[message.riskLevel as RiskLevel] || ""}`}>{message.riskLevel}</span>}
          </div>
        )}
        <div className="mt-1 flex items-center gap-2 pl-1">
          <button onClick={() => markFeedback(true)} disabled={Boolean(feedback)} className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] ${feedback === "helpful" ? "bg-green-100 text-green-700" : "bg-slate-50 text-slate-400 hover:bg-green-50 hover:text-green-600"}`}>👍 {feedback === "helpful" ? "有用" : ""}</button>
          <button onClick={() => markFeedback(false)} disabled={Boolean(feedback)} className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] ${feedback === "notHelpful" ? "bg-red-100 text-red-700" : "bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-600"}`}>👎 {feedback === "notHelpful" ? "没用" : ""}</button>
        </div>
      </div>
    </div>
  );
}

export function ClassicChatClient({
  roleLabel,
  quickQuestions,
  initialMessages,
  initialSessionId,
  initialQuestion = "",
  customerId,
  customerName,
  sessions = [],
  onSessionDelete,
}: {
  roleLabel: string;
  quickQuestions: string[];
  initialMessages: Msg[];
  initialSessionId: string | null;
  initialQuestion?: string;
  customerId?: string;
  customerName?: string;
  sessions?: SessionItem[];
  onSessionDelete?: (id: string) => void | Promise<void>;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [input, setInput] = useState(initialQuestion);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const autoSentRef = useRef(false);

  const href = ({ nextSessionId, isNew, customer }: { nextSessionId?: string; isNew?: boolean; customer?: string | null } = {}) => {
    const params = new URLSearchParams({ view: "classic" });
    const effectiveCustomer = customer === undefined ? customerId : customer;
    if (effectiveCustomer) params.set("customerId", effectiveCustomer);
    if (nextSessionId) params.set("sessionId", nextSessionId);
    if (isNew) params.set("new", "1");
    return `/chat?${params.toString()}`;
  };

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => {
    if (initialQuestion && !autoSentRef.current && messages.length === 0) {
      autoSentRef.current = true;
      void send(initialQuestion);
    }
    // Initial question intentionally sends only once for this route instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFeedback = useCallback(async (messageId: string, isHelpful: boolean) => {
    try { await submitAiFeedback({ messageId, isHelpful }); } catch { /* Feedback never blocks chat. */ }
  }, []);

  async function send(value: string) {
    const question = value.trim();
    if (!question || loading) return;
    const isFirstMessage = !sessionId;
    setInput("");
    setMessages((list) => [...list, { id: `u${Date.now()}`, role: "user", text: question }]);
    setLoading(true);
    try {
      const result = await chatApi.ask(question, sessionId, customerId);
      if (!result.ok || !result.data) throw new Error(result.error || "请求失败");
      const data = result.data;
      setSessionId(data.sessionId);
      setMessages((list) => [...list, { id: data.messageId, role: "ai", text: data.answer, riskLevel: data.riskLevel, answerType: data.answerType }]);
      if (isFirstMessage) router.replace(href({ nextSessionId: data.sessionId }));
    } catch {
      setMessages((list) => [...list, { id: `e${Date.now()}`, role: "ai", text: "⚠️ 网络不太稳定，请稍后重试。" }]);
    } finally { setLoading(false); }
  }

  async function sendImage(file: File) {
    if (loading) return;
    if (file.size > 8 * 1024 * 1024) {
      setMessages((list) => [...list, { id: `e${Date.now()}`, role: "ai", text: "图片请控制在 8MB 以内后再试。" }]);
      return;
    }
    setMessages((list) => [...list, { id: `u${Date.now()}`, role: "user", text: "📷 [图片]" }]);
    setLoading(true);
    try {
      const imageUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("图片读取失败"));
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/vision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl, sessionId, customerId }) });
      const result = await response.json();
      if (!response.ok || !result.answer) throw new Error(result.error || "图片处理失败");
      setSessionId(result.sessionId || sessionId);
      setMessages((list) => [...list, { id: result.messageId || `ai${Date.now()}`, role: "ai", text: result.answer, riskLevel: result.riskLevel, answerType: result.answerType }]);
      if (!sessionId && result.sessionId) router.replace(href({ nextSessionId: result.sessionId }));
    } catch (error: any) {
      setMessages((list) => [...list, { id: `e${Date.now()}`, role: "ai", text: `图片处理失败：${error?.message || "请稍后重试。"}` }]);
    } finally { setLoading(false); }
  }

  return (
    <div className="classic-coach flex h-screen flex-col bg-[var(--page)]">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-white px-4 py-3">
        <div className="relative flex items-center justify-center">
          <button onClick={() => router.push("/chat?view=classic")} className="absolute left-0 flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[15px] font-bold text-[var(--ink)]" aria-label="返回经典对话">←</button>
          <div className="text-center"><div className="text-[15px] font-semibold text-[var(--ink)]">AI 教练</div><div className="text-[11px] text-[var(--faint)]">{roleLabel} · AI 助手</div></div>
        </div>
      </header>
      <CoachModeTabs active="classic" />

      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto border-b border-slate-100 bg-white px-3 py-2">
        <button onClick={() => router.push(href({ isNew: true }))} className="flex shrink-0 items-center gap-1 rounded-full border border-brand bg-brand/5 px-3 py-1 text-xs font-medium text-brand-dark">＋ 新对话</button>
        {sessions.map((session) => (
          <div key={session.id} className={`group relative flex max-w-[9rem] shrink-0 items-center rounded-full text-xs ${session.id === sessionId ? "bg-[var(--green-soft)] font-medium text-[var(--green-dark)]" : "border border-slate-200 text-slate-600"}`}>
            <button onClick={() => router.push(href({ nextSessionId: session.id, customer: session.customerId ?? null }))} className="truncate px-3 py-1 pr-5">{session.title || "未命名对话"}</button>
            <button onClick={() => { if (confirm("确定删除这条对话记录吗？")) { onSessionDelete?.(session.id); if (session.id === sessionId) router.replace(href({ isNew: true })); } }} className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full px-1 text-[10px] text-slate-400 opacity-0 transition hover:text-red-500 group-hover:opacity-100" title="删除">×</button>
          </div>
        ))}
      </div>

      {customerId && customerName && <div className="flex items-center gap-1.5 border-b border-[var(--line)] bg-[var(--green-soft)] px-4 py-2 text-xs text-[var(--green-dark)]"><span>正在针对客户</span><span className="font-semibold">{customerName}</span><span className="opacity-70">· 已结合 TA 的画像与历史</span></div>}

      <main ref={scrollRef} className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">这里是<span className="font-medium text-slate-600">自由对话</span>，想问什么直接说。<br /><span className="text-xs text-[var(--faint)]">想要「点一下出结构化结果」？回</span><button onClick={() => router.push("/chat")} className="text-xs text-[var(--green-dark)]">AI 教练工作台</button></div>}
        {messages.map((message) => message.role === "user" ? <div key={message.id} className="flex justify-end"><div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand px-3.5 py-2.5 text-sm text-white">{message.text}</div></div> : <ClassicAiBubble key={message.id} message={message} onFeedback={handleFeedback} />)}
        {loading && <div className="flex justify-start"><div className="rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2.5 text-sm text-slate-400">正在思考…</div></div>}
      </main>

      {quickQuestions.length > 0 && <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-slate-100 bg-white px-3 py-2">{quickQuestions.map((question) => <button key={question} onClick={() => void send(question)} className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600">{question}</button>)}</div>}
      <div className="flex items-center gap-2 border-t border-slate-100 bg-white px-3 pt-2"><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void sendImage(file); e.target.value = ""; }} /><button onClick={() => fileRef.current?.click()} disabled={loading} className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 disabled:opacity-50">📷 图片</button><button disabled title="暂未开放" className="flex items-center gap-1 rounded-full border border-slate-100 px-3 py-1.5 text-xs text-slate-300">🎤 录音</button></div>
      <div className="flex items-end gap-2 border-t border-slate-100 bg-white px-3 py-2" style={{ paddingBottom: "calc(var(--safe-bottom) + 8px)" }}><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }} rows={1} placeholder="输入你的问题…" className="max-h-28 flex-1 resize-none rounded-2xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand" /><button onClick={() => void send(input)} disabled={loading || !input.trim()} className="shrink-0 rounded-2xl bg-brand px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">发送</button></div>
    </div>
  );
}
