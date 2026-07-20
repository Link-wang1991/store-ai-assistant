"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RISK_LEVEL_COLORS, type RiskLevel } from "@/lib/constants";
import { chatApi } from "@/lib/api-client";
import { submitAiFeedback } from "@/lib/actions";
import { BottomNav, STAFF_NAV } from "@/components/BottomNav";
import { Brand } from "@/components/Brand";

interface SessionItem {
  id: string;
  title?: string | null;
}

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

function renderInline(text: string, kp: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={kp + i} className="font-semibold text-slate-900">{p.slice(2, -2)}</strong>
    ) : (
      <span key={kp + i}>{p}</span>
    )
  );
}

function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} className="h-1.5" />;
        const isBullet = /^[-•·①②③④⑤⑥⑦⑧⑨⑩]/.test(t) || /^\d+[.)、]/.test(t);
        if (isBullet) {
          const content = t.replace(/^[-•·①②③④⑤⑥⑦⑧⑨⑩]\s*/, "").replace(/^\d+[.)、]\s*/, "");
          return (
            <div key={i} className="flex gap-1.5">
              <span className="mt-px shrink-0 text-[var(--green-dark)]">·</span>
              <span>{renderInline(content, `l${i}-`)}</span>
            </div>
          );
        }
        return <div key={i}>{renderInline(t, `l${i}-`)}</div>;
      })}
    </div>
  );
}

function AiBubble({ m, onFeedback, onPreview }: { m: Msg; onFeedback?: (mid: string, helpful: boolean) => void; onPreview?: () => void }) {
  const [open, setOpen] = useState(false);
  const [fb, setFb] = useState<string>("");
  const idx = m.text.indexOf(ANALYSIS_MARKER);
  const main = idx >= 0 ? m.text.slice(0, idx).trim() : m.text;
  const analysis = idx >= 0 ? m.text.slice(idx + ANALYSIS_MARKER.length).trim() : "";
  const isAgentAction = /\n\n✅/.test(main);

  function clickFeedback(label: string, helpful: boolean) {
    if (fb) return;
    setFb(label);
    onFeedback?.(m.id, helpful);
  }

  return (
    <div className="ref-chat-ai-row">
      <span className="ref-chat-ai-mark" aria-hidden="true"><CoachMark /></span>
      <div className="min-w-0 flex-1">
        <div className={`ref-chat-ai ${isAgentAction ? "border-l-[3px] border-l-[#078a4c]" : ""}`}>
          <RichText text={main} />
          {isAgentAction && <div className="mt-3 border-t border-[#e6ece7] pt-3 text-right"><button onClick={onPreview} className="ref-primary min-h-[32px] px-3 text-[11px]">↗ 预览并确认发送</button></div>}
        </div>

        {analysis && (
          <details open={open} className="ref-chat-detail" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}><summary><span className="flex items-center gap-1.5"><InsightIcon />分析思路与策略</span><ChevronIcon open={open} /></summary><p><RichText text={analysis} /></p></details>
        )}

        {(m.answerType || m.riskLevel) && (
          <div className="mt-2 flex gap-1.5">
            {m.answerType && (
              <span className="ref-status ref-status-green">
                {ANSWER_TYPE_LABEL[m.answerType] || m.answerType}
              </span>
            )}
            {m.riskLevel && m.riskLevel !== "L1" && (
              <span className={`ref-status ${RISK_LEVEL_COLORS[m.riskLevel as RiskLevel] || "ref-status-red"}`}>
                {m.riskLevel}
              </span>
            )}
          </div>
        )}

        <div className="ref-feedback">
          {[{ label: "已接受", helpful: true }, { label: "已预约", helpful: true }, { label: "仍有顾虑", helpful: false }, { label: "需要升级", helpful: false }].map((item) => <button
            key={item.label}
            onClick={() => clickFeedback(item.label, item.helpful)}
            disabled={Boolean(fb)}
            className={`transition-colors ${fb === item.label ? item.helpful ? "border-[#8cd5a4] bg-[#e8f5e9] text-[#006d37]" : "border-[#efbdb6] bg-[#fff0ed] text-[#c4392e]" : "hover:border-[#8cd5a4] hover:text-[#006d37]"}`}
          >{item.label}</button>)}
        </div>
      </div>
    </div>
  );
}

export function ChatClient({
  roleLabel,
  storeName,
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
  storeName: string;
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
  const [scenePicker, setScenePicker] = useState(false);
  const [pendingScene, setPendingScene] = useState("");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const autoSentRef = useRef(false);

  // AI 回答反馈处理
  const handleFeedback = useCallback(async (messageId: string, isHelpful: boolean) => {
    try {
      await submitAiFeedback({ messageId, isHelpful });
    } catch {
      // 静默失败，不影响体验
    }
  }, []);

  useEffect(() => {
    if (initialQuestion && !autoSentRef.current && messages.length === 0) {
      autoSentRef.current = true;
      send(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(q: string) {
    const question = q.trim();
    if (!question || loading) return;
    const wasNew = !sessionId;
    setInput("");
    const uid = "u" + Date.now();
    setMessages((m) => [...m, { id: uid, role: "user", text: question }]);
    setLoading(true);
    try {
      const result = await chatApi.ask(question, sessionId, customerId);
      if (!result.ok || !result.data) {
        throw new Error(result.error || "请求失败");
      }
      const d = result.data;
      setSessionId(d.sessionId);
      setMessages((m) => [
        ...m,
        { id: d.messageId, role: "ai", text: d.answer, riskLevel: d.riskLevel, answerType: d.answerType },
      ]);
      if (wasNew) {
        router.replace(`/chat?sessionId=${d.sessionId}`);
      }
    } catch {
      setMessages((m) => [...m, { id: "e" + Date.now(), role: "ai", text: "⚠️ 网络不太稳定，请稍后重试。" }]);
    } finally {
      setLoading(false);
    }
  }

  async function sendImage(file: File, hint: string) {
    if (loading) return;
    if (file.size > 8 * 1024 * 1024) {
      setMessages((m) => [...m, { id: "ei" + Date.now(), role: "ai", text: "图片请控制在 8MB 以内后再试。" }]);
      return;
    }
    const wasNew = !sessionId;
    setMessages((m) => [...m, { id: "ui" + Date.now(), role: "user", text: `📷 [图片${hint ? "·" + hint : ""}]` }]);
    setLoading(true);
    try {
      const imageUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("图片读取失败"));
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/vision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl, hint, sessionId }) });
      const result = await response.json();
      if (!response.ok || !result.answer) throw new Error(result.error || "图片处理失败");
      setSessionId(result.sessionId || sessionId);
      setMessages((m) => [...m, { id: result.messageId || "ai" + Date.now(), role: "ai", text: result.answer, riskLevel: result.riskLevel, answerType: result.answerType }]);
      if (wasNew && result.sessionId) router.replace(`/chat?sessionId=${result.sessionId}`);
    } catch (error: any) {
      setMessages((m) => [...m, { id: "ei" + Date.now(), role: "ai", text: `图片处理失败：${error?.message || "请稍后重试。"}` }]);
    } finally {
      setLoading(false);
    }
  }

  function previewMessage() {
    if (customerId) {
      router.push(`/chat?customerId=${customerId}&new=1`);
      return;
    }
    setInput("请基于上面的建议，生成一段可直接发送给客户的确认话术。");
  }

  return (
    <div className="ref-chat">
      <header className="ref-topbar">
        <button onClick={() => router.push("/chat")} className="text-left"><Brand /></button>
        <button onClick={() => router.push("/admin")} className="ref-management-pill">管理</button>
      </header>

      <main ref={scrollRef} className="ref-chat-main no-scrollbar max-h-[calc(100vh-44px)] overflow-y-auto">
        <section className="ref-card ref-context">
          <div className="mb-2 flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className="rounded bg-[#eaf7ee] px-1.5 py-0.5 text-[10px] font-bold text-[#078a4c]">{customerId ? "客户模式" : "自由对话"}</span><h2 className="truncate text-[16px] font-bold tracking-tight text-[#172119]">{customerName || "门店经营助手"}</h2></div><button onClick={() => router.push("/chat")} className="rounded-lg border border-[#b6e0c1] px-2 py-1 text-[10px] font-bold text-[#078a4c]">{customerId ? "切换客户" : "选择客户"}</button></div>
          <div className="grid grid-cols-2 gap-y-1 text-[11px] text-[#738077]"><span className="flex items-center gap-1"><ClockIcon />{customerId ? "已关联画像与历史" : "可随时直接提问"}</span><span className="flex items-center gap-1"><RoleIcon />{roleLabel}</span></div>
        </section>

        {messages.length === 0 && (
          <section className="mt-3 space-y-3">
            <div className="ref-card ref-coach-script"><div className="ref-coach-label"><CoachLineIcon />可以直接说</div><p className="text-[13px] italic leading-relaxed text-[#2c392f]">“描述客户的顾虑、当前进展或你想达成的目标。我会给你可直接使用的话术和下一步动作。”</p></div>
            <div className="ref-coach-grid"><div className="ref-card ref-coach-mini"><div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-[#2775bd]"><QuestionIcon />接下来要问</div><p className="text-[11px] leading-relaxed text-[#6b786e]">1. 客户最在意什么？<br />2. 哪一步还没确认？</p></div><div className="ref-card ref-coach-mini"><div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-[#006d37]"><ActionIcon />下一步动作</div><p className="text-[12px] font-bold text-[#263128]">明确目标后发起跟进</p><p className="mt-1 text-[10px] text-[#748077]">负责人：{roleLabel} · 今日</p></div></div>
            <div className="ref-coach-risk"><WarningIcon /><div><b className="block text-[12px] text-[#c4392e]">风险提醒</b><p className="mt-1 text-[11px] leading-relaxed">涉及价格、承诺或投诉时，先确认事实与客户感受，避免直接给出折扣承诺。</p></div></div>
          </section>
        )}
        <section className="ref-chat-thread">
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="ref-chat-user whitespace-pre-wrap">
                {m.text}
              </div>
            </div>
          ) : (
            <AiBubble key={m.id} m={m} onFeedback={handleFeedback} onPreview={previewMessage} />
          )
        )}
        {loading && (
          <div className="ref-chat-ai-row"><span className="ref-chat-ai-mark"><CoachMark /></span><div className="ref-chat-ai text-[#738077]">正在检索门店知识并组织建议…</div>
          </div>
        )}
        </section>

      {quickQuestions.length > 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-4">
          {quickQuestions.map((q) => (
            <button key={q} onClick={() => send(q)} className="ref-chip shrink-0">
              {q}
            </button>
          ))}
        </div>
      )}
      </main>

      <div className="ref-chat-input-wrap"><div className="ref-chat-input">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f, ""); e.target.value = ""; }} />
        <button onClick={() => fileRef.current?.click()} disabled={loading} title="上传图片"><PlusIcon /></button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          rows={1}
          placeholder="向教练提问…"
          className=""
        />
        <button disabled title="录音暂未开放" className="opacity-40"><MicIcon /></button><button onClick={() => send(input)} disabled={loading || !input.trim()} className="send disabled:opacity-50"><SendIcon /></button>
      </div></div>
      <BottomNav items={STAFF_NAV} />
    </div>
  );
}

function CoachMark() { return <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M7 10a5 5 0 0 1 10 0v4a5 5 0 0 1-10 0v-4Z" /><path d="M9 10h.01M15 10h.01M9.5 15h5M12 5V3M5.5 8.5 4 7M18.5 8.5 20 7" /></svg>; }
function CoachLineIcon() { return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z" /></svg>; }
function QuestionIcon() { return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><path d="M9.8 9a2.4 2.4 0 1 1 4.1 1.7c-.9.7-1.9 1.2-1.9 2.5M12 16.8h.01" /></svg>; }
function ActionIcon() { return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="m13 2-8 12h6l-1 8 9-13h-6l1-7Z" /></svg>; }
function WarningIcon() { return <svg viewBox="0 0 24 24" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#c4392e]" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v4M12 16h.01" /></svg>; }
function PlusIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 5v14M5 12h14" /></svg>; }
function MicIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4" /></svg>; }
function SendIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 12 14-7-4 14-3-5-7-2Z" /><path d="m12 14 3-3" /></svg>; }
function InsightIcon() { return <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4.5" y="4.5" width="15" height="15" rx="2" /><path d="M8 9h8M8 13h5" /></svg>; }
function ChevronIcon({ open }: { open: boolean }) { return <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>; }
function ClockIcon() { return <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="7.5" /><path d="M12 7.8v4.5l3 1.7" /></svg>; }
function RoleIcon() { return <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="8.5" r="3" /><path d="M6.5 19a5.5 5.5 0 0 1 11 0" /></svg>; }
