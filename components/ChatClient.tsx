"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RISK_LEVEL_COLORS, type RiskLevel } from "@/lib/constants";
import { chatApi, getToken } from "@/lib/api-client";

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

function AiBubble({ m }: { m: Msg }) {
  const [open, setOpen] = useState(false);
  const idx = m.text.indexOf(ANALYSIS_MARKER);
  const main = idx >= 0 ? m.text.slice(0, idx).trim() : m.text;
  const analysis = idx >= 0 ? m.text.slice(idx + ANALYSIS_MARKER.length).trim() : "";

  return (
    <div className="flex justify-start">
      <div className="max-w-[88%]">
        <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2.5 text-sm leading-relaxed text-slate-800">
          <RichText text={main} />
        </div>

        {analysis && (
          <div className="mt-1.5 pl-1">
            <button
              onClick={() => setOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/5 px-2.5 py-1 text-[11px] font-medium text-brand-dark transition-colors hover:bg-brand/10"
            >
              {open ? "▴ 收起分析" : "📋 分析思路与策略 · 点开看为什么"}
            </button>
            {open && (
              <div className="mt-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
                <RichText text={analysis} />
              </div>
            )}
          </div>
        )}

        {(m.answerType || m.riskLevel) && (
          <div className="mt-1 flex gap-1.5 pl-1">
            {m.answerType && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                {ANSWER_TYPE_LABEL[m.answerType] || m.answerType}
              </span>
            )}
            {m.riskLevel && m.riskLevel !== "L1" && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${RISK_LEVEL_COLORS[m.riskLevel as RiskLevel] || ""}`}>
                {m.riskLevel}
              </span>
            )}
          </div>
        )}
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
      if (wasNew) router.refresh();
    } catch {
      setMessages((m) => [...m, { id: "e" + Date.now(), role: "ai", text: "⚠️ 网络不太稳定，请稍后重试。" }]);
    } finally {
      setLoading(false);
    }
  }

  async function sendImage(file: File, hint: string) {
    if (loading) return;
    setMessages((m) => [...m, { id: "ui" + Date.now(), role: "user", text: `📷 [图片${hint ? "·" + hint : ""}]` })]);
    setMessages((m) => [...m, { id: "ei" + Date.now(), role: "ai", text: "图片识别功能暂未接入后端，即将支持。" }]);
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
        <Link href="/chat" className="text-xs text-[var(--green-dark)]">‹ AI 教练</Link>
        <div className="text-center">
          <div className="text-sm font-semibold text-slate-900">{storeName}</div>
          <div className="text-xs text-slate-400">{roleLabel} · AI 助手</div>
        </div>
        <Link href="/me" className="text-xs text-slate-400">我的</Link>
      </header>

      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto border-b border-slate-100 bg-white px-3 py-2">
        <button
          onClick={() => router.push("/chat?new=1")}
          className="flex shrink-0 items-center gap-1 rounded-full border border-brand bg-brand/5 px-3 py-1 text-xs font-medium text-brand-dark"
        >
          ＋ 新对话
        </button>
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => router.push(`/chat?sessionId=${s.id}`)}
            className={`max-w-[9rem] shrink-0 truncate rounded-full px-3 py-1 text-xs ${
              s.id === sessionId ? "bg-[var(--green-soft)] font-medium text-[var(--green-dark)]" : "border border-slate-200 text-slate-600"
            }`}
          >
            {s.title || "未命名对话"}
          </button>
        ))}
      </div>

      {customerId && customerName && (
        <div className="flex items-center gap-1.5 border-b border-[var(--line)] bg-[var(--green-soft)] px-4 py-2 text-xs text-[var(--green-dark)]">
          <span>正在针对客户</span>
          <span className="font-semibold">{customerName}</span>
          <span className="opacity-70">· 已结合 TA 的画像与历史</span>
        </div>
      )}

      <div ref={scrollRef} className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
            这里是<span className="font-medium text-slate-600">自由对话</span>，想问什么直接说。
            <br />
            <span className="text-xs text-[var(--faint)]">想要「点一下出结构化结果」？回</span>
            <a href="/chat" className="text-xs text-[var(--green-dark)]">AI 教练选场景</a>
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand px-3.5 py-2.5 text-sm text-white">
                {m.text}
              </div>
            </div>
          ) : (
            <AiBubble key={m.id} m={m} />
          )
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2.5 text-sm text-slate-400">正在思考…</div>
          </div>
        )}
      </div>

      {quickQuestions.length > 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-slate-100 bg-white px-3 py-2">
          {quickQuestions.map((q) => (
            <button key={q} onClick={() => send(q)} className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600">
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-slate-100 bg-white px-3 pt-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f, ""); e.target.value = ""; }} />
        <button onClick={() => fileRef.current?.click()} disabled={loading} className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 disabled:opacity-50">
          📷 图片
        </button>
        <button disabled title="暂未开放" className="flex items-center gap-1 rounded-full border border-slate-100 px-3 py-1.5 text-xs text-slate-300">
          🎤 录音
        </button>
      </div>

      <div className="flex items-end gap-2 border-t border-slate-100 bg-white px-3 py-2" style={{ paddingBottom: "calc(var(--safe-bottom) + 8px)" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          rows={1}
          placeholder="输入你的问题…"
          className="max-h-28 flex-1 resize-none rounded-2xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand"
        />
        <button onClick={() => send(input)} disabled={loading || !input.trim()} className="shrink-0 rounded-2xl bg-brand px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          发送
        </button>
      </div>
    </div>
  );
}
