"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RISK_LEVEL_COLORS, type RiskLevel } from "@/lib/constants";
import { chatApi, type AiActionProposal, type ActionProposalAssignee } from "@/lib/api-client";
import { BottomNav, STAFF_NAV } from "@/components/BottomNav";
import { Brand } from "@/components/Brand";
import { CoachModeTabs } from "@/components/CoachModeTabs";

interface SessionItem {
  id: string;
  title?: string | null;
  customerId?: string | null;
}

interface Msg {
  id: string;
  role: "user" | "ai";
  text: string;
  riskLevel?: string | null;
  answerType?: string | null;
  generationMode?: string | null;
  feedbackType?: string | null;
  retrieved?: { chunkId?: string; documentId?: string; documentTitle?: string; snippet: string }[];
  methodology?: { id?: string; scenarioKey?: string; title: string; module?: string; source?: string }[];
  actionProposal?: AiActionProposal | null;
}

const ANSWER_TYPE_LABEL: Record<string, string> = {
  knowledge: "门店知识库",
  general: "通用建议",
  need_confirm: "待确认",
  risk: "高风险·已升级",
};
const GENERATION_MODE_LABEL: Record<string, string> = {
  model: "模型生成",
  fallback: "资料/规则兜底",
  safety_rule: "安全规则",
  legacy: "历史记录",
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

function toLocalDateTime(value?: string | null) {
  const date = value ? new Date(value) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ActionProposalEditor({
  proposal, busy, onSave, onCancel,
}: {
  proposal: AiActionProposal;
  busy: boolean;
  onSave: (input: Pick<AiActionProposal, "title" | "content" | "assignedTo" | "priority" | "dueAt">) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(proposal.title);
  const [content, setContent] = useState(proposal.content);
  const [assignees, setAssignees] = useState<ActionProposalAssignee[]>([]);
  const [assignedTo, setAssignedTo] = useState(proposal.assignedTo || "");
  const [priority, setPriority] = useState(proposal.priority || "normal");
  const [dueAt, setDueAt] = useState(toLocalDateTime(proposal.dueAt));
  const [error, setError] = useState("");

  useEffect(() => {
    chatApi.actionProposalAssignees().then((result) => {
      if (!result.ok || !result.data) return;
      setAssignees(result.data);
      if (!assignedTo && result.data[0]) setAssignedTo(result.data[0].id);
    });
  }, [assignedTo]);

  async function save() {
    if (!title.trim() || !content.trim() || !assignedTo || !dueAt) {
      setError("请补齐动作、负责人和截止时间。");
      return;
    }
    setError("");
    await onSave({ title: title.trim(), content: content.trim(), assignedTo, priority, dueAt: new Date(dueAt).toISOString() });
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-[#b6e0c1] bg-white p-2.5 text-[11px]">
      <div className="font-semibold text-[var(--green-dark)]">确认前先完善待办</div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="ref-field h-9 text-[12px]" aria-label="待办标题" />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} rows={3} className="ref-field min-h-[72px] text-[12px]" aria-label="具体动作" />
      <div className="grid grid-cols-2 gap-2">
        <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="ref-field h-9 text-[11px]" aria-label="负责人">
          {assignees.length === 0 ? <option value={assignedTo}>加载负责人…</option> : assignees.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="ref-field h-9 text-[11px]" aria-label="优先级">
          <option value="normal">普通</option><option value="high">重要</option><option value="urgent">紧急</option>
        </select>
      </div>
      <label className="block text-[11px] text-[var(--muted)]">截止时间<input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="ref-field mt-1 h-9 w-full text-[11px]" /></label>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <div className="flex justify-end gap-2"><button onClick={onCancel} disabled={busy} className="rounded-full border border-[var(--line)] px-3 py-1.5">取消</button><button onClick={() => void save()} disabled={busy} className="rounded-full bg-[var(--green)] px-3 py-1.5 text-white">{busy ? "保存中…" : "保存待办"}</button></div>
    </div>
  );
}

function AiBubble({
  m, onFeedback, onPreview, canCreateAction, onCreateAction, onResolveAction, onUpdateAction,
}: {
  m: Msg;
  onFeedback?: (mid: string, label: string, comment?: string) => Promise<boolean>;
  onPreview?: () => void;
  canCreateAction?: boolean;
  onCreateAction?: (mid: string) => Promise<AiActionProposal | null>;
  onResolveAction?: (proposalId: string, decision: "apply" | "reject") => Promise<AiActionProposal | null>;
  onUpdateAction?: (proposalId: string, input: Pick<AiActionProposal, "title" | "content" | "assignedTo" | "priority" | "dueAt">) => Promise<AiActionProposal | null>;
}) {
  const [open, setOpen] = useState(false);
  const [fb, setFb] = useState<string>(m.feedbackType || "");
  const [proposal, setProposal] = useState<AiActionProposal | null>(m.actionProposal || null);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [editingProposal, setEditingProposal] = useState(false);
  const idx = m.text.indexOf(ANALYSIS_MARKER);
  const main = idx >= 0 ? m.text.slice(0, idx).trim() : m.text;
  const analysis = idx >= 0 ? m.text.slice(idx + ANALYSIS_MARKER.length).trim() : "";
  const isAgentAction = /\n\n✅/.test(main);

  async function clickFeedback(label: string) {
    if (fb) return;
    const needsReason = ["仍有顾虑", "信息有误", "需要升级"].includes(label);
    const comment = needsReason ? window.prompt(`请补充“${label}”的具体原因（可留空）：`) : "";
    if (comment === null) return;
    const saved = await onFeedback?.(m.id, label, comment || undefined);
    if (saved !== false) setFb(label);
  }

  async function createAction() {
    if (!onCreateAction || proposalBusy) return;
    setProposalBusy(true);
    try {
      const next = await onCreateAction(m.id);
      if (next) setProposal(next);
    } finally { setProposalBusy(false); }
  }

  async function resolveAction(decision: "apply" | "reject") {
    if (!proposal || !onResolveAction || proposalBusy) return;
    setProposalBusy(true);
    try {
      const next = await onResolveAction(proposal.id, decision);
      if (next) setProposal(next);
    } finally { setProposalBusy(false); }
  }

  async function updateAction(input: Pick<AiActionProposal, "title" | "content" | "assignedTo" | "priority" | "dueAt">) {
    if (!proposal || !onUpdateAction || proposalBusy) return;
    setProposalBusy(true);
    try {
      const next = await onUpdateAction(proposal.id, input);
      if (next) { setProposal(next); setEditingProposal(false); }
    } finally { setProposalBusy(false); }
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
          <details open={open} className="ref-chat-detail" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}><summary><span className="flex items-center gap-1.5"><InsightIcon />分析思路与策略</span><ChevronIcon open={open} /></summary><div className="ref-chat-detail-content"><RichText text={analysis} /></div></details>
        )}

        {m.retrieved && m.retrieved.length > 0 && (
          <details className="ref-chat-detail mt-2"><summary><span className="flex items-center gap-1.5"><InsightIcon />本次引用的门店资料快照（{m.retrieved.length}）</span><ChevronIcon open={false} /></summary><div className="ref-chat-detail-content"><p className="mb-2 text-[11px] text-[var(--faint)]">以下为回答生成时实际命中的片段；资料更新后，历史回答仍以这里的快照为准。</p>{m.retrieved.map((item, index) => <div key={`${item.chunkId || index}`} className="mb-2 rounded-lg border border-[var(--line)] bg-white/70 px-2.5 py-2"><div className="flex items-center justify-between gap-2"><span className="font-medium text-[var(--ink)]">{index + 1}. {item.documentTitle ? `《${item.documentTitle}》` : "门店资料"}</span>{item.documentId && <Link href={`/knowledge?source=${encodeURIComponent(item.documentId)}`} className="shrink-0 text-[11px] font-medium text-[var(--green-dark)] underline underline-offset-2">查看原资料</Link>}</div><p className="mt-1 whitespace-pre-wrap">{item.snippet}</p></div>)}</div></details>
        )}

        {m.methodology && m.methodology.length > 0 && (
          <details className="ref-chat-detail mt-2"><summary><span className="flex items-center gap-1.5"><InsightIcon />系统销售方法论（{m.methodology.length}）</span><ChevronIcon open={false} /></summary><div className="ref-chat-detail-content">{m.methodology.map((item, index) => <span key={`${item.id || item.scenarioKey || index}`} className="mb-1 block">{index + 1}. 《{item.title}》{item.module ? ` · ${item.module}` : ""}{item.source ? `\n来源：${item.source}` : ""}</span>)}<div className="mt-1 text-[11px] text-[var(--faint)]">仅用于销售判断与沟通策略；门店资料、价格与服务规则优先。</div></div></details>
        )}

        {(m.answerType || m.riskLevel || m.generationMode) && (
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
            {m.generationMode && <span className="ref-status border border-[var(--line)] bg-white text-[var(--muted)]">{GENERATION_MODE_LABEL[m.generationMode] || m.generationMode}</span>}
          </div>
        )}

        {proposal ? (
          <div className="mt-2 rounded-xl border border-[var(--green-light)] bg-[var(--green-soft)]/60 p-3 text-[12px] text-[var(--muted)]">
            <div className="font-semibold text-[var(--green-dark)]">待确认跟进建议</div>
            <div className="mt-1 text-[var(--ink)]">{proposal.title}</div>
            <div className="mt-1 text-[11px]">负责人：{proposal.assignedTo ? "已设置（可调整）" : "待设置"} · {proposal.priority === "urgent" ? "紧急" : proposal.priority === "high" ? "重要" : "普通"} · 截止：{proposal.dueAt ? new Date(proposal.dueAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "待设置"}</div>
            {proposal.status === "pending" ? (
              <>
                {editingProposal && onUpdateAction && <ActionProposalEditor proposal={proposal} busy={proposalBusy} onSave={updateAction} onCancel={() => setEditingProposal(false)} />}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => setEditingProposal((value) => !value)} disabled={proposalBusy} className="rounded-full border border-[var(--green-light)] bg-white px-3 py-1.5 text-[11px] disabled:opacity-50">调整待办</button>
                  <button onClick={() => void resolveAction("reject")} disabled={proposalBusy} className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-[11px] disabled:opacity-50">暂不创建</button>
                  <button onClick={() => void resolveAction("apply")} disabled={proposalBusy} className="rounded-full bg-[var(--green)] px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50">{proposalBusy ? "处理中…" : "确认创建待办"}</button>
                </div>
              </>
            ) : proposal.status === "applied" ? (
              <div className="mt-2 rounded-lg border border-[#b6e0c1] bg-white/80 p-2 text-[11px] text-[var(--green-dark)]">
                <p className="font-medium">{proposal.appliedTaskStatus === "done" ? "已闭环：正式待办已完成" : proposal.appliedTaskStatus === "doing" ? "执行中：正式待办正在处理" : "已创建：等待负责人执行"}</p>
                {proposal.appliedTaskFeedback && <p className="mt-1 leading-relaxed">执行反馈：{proposal.appliedTaskFeedback}</p>}
                {proposal.appliedTaskId && <Link href="/tasks" className="mt-1 inline-block underline underline-offset-2">查看正式待办与结果</Link>}
              </div>
            ) : <div className="mt-2 text-[11px] text-[var(--faint)]">已选择暂不创建，未写入正式任务。</div>}
          </div>
        ) : canCreateAction && onCreateAction && (
          <button onClick={() => void createAction()} disabled={proposalBusy} className="mt-2 rounded-full border border-[var(--green-light)] bg-white px-3 py-1.5 text-[11px] font-medium text-[var(--green-dark)] disabled:opacity-50">{proposalBusy ? "正在生成待办…" : "将建议转为待办"}</button>
        )}

        <div className="ref-feedback">
          {["已接受", "已预约", "仍有顾虑", "信息有误", "需要升级"].map((label) => <button
            key={label}
            onClick={() => void clickFeedback(label)}
            disabled={Boolean(fb)}
            className={`transition-colors ${fb === label ? (label === "已接受" || label === "已预约") ? "border-[#8cd5a4] bg-[#e8f5e9] text-[#006d37]" : "border-[#efbdb6] bg-[#fff0ed] text-[#c4392e]" : "hover:border-[#8cd5a4] hover:text-[#006d37]"}`}
          >{label}</button>)}
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
  view = "workbench",
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
  view?: "workbench" | "classic";
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

  const chatHref = ({ nextSessionId, newConversation = false, customerIdOverride }: { nextSessionId?: string; newConversation?: boolean; customerIdOverride?: string | null } = {}) => {
    const params = new URLSearchParams();
    if (view === "classic") params.set("view", "classic");
    const effectiveCustomerId = customerIdOverride === undefined ? customerId : customerIdOverride;
    if (effectiveCustomerId) params.set("customerId", effectiveCustomerId);
    if (nextSessionId) params.set("sessionId", nextSessionId);
    if (newConversation) params.set("new", "1");
    const query = params.toString();
    return query ? `/chat?${query}` : "/chat";
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const autoSentRef = useRef(false);

  // AI 回答反馈处理
  const handleFeedback = useCallback(async (messageId: string, feedbackType: string, comment?: string) => {
    try {
      const result = await chatApi.feedback(messageId, feedbackType, comment);
      return result.ok;
    } catch {
      return false;
    }
  }, []);

  const handleCreateAction = useCallback(async (messageId: string) => {
    const result = await chatApi.createActionProposal(messageId);
    if (!result.ok || !result.data) {
      alert(result.error || "暂时无法生成待办建议");
      return null;
    }
    return result.data;
  }, []);

  const handleResolveAction = useCallback(async (proposalId: string, decision: "apply" | "reject") => {
    const result = decision === "apply"
      ? await chatApi.applyActionProposal(proposalId)
      : await chatApi.rejectActionProposal(proposalId);
    if (!result.ok || !result.data) {
      alert(result.error || "处理待办建议失败");
      return null;
    }
    return result.data;
  }, []);

  const handleUpdateAction = useCallback(async (
    proposalId: string,
    input: Pick<AiActionProposal, "title" | "content" | "assignedTo" | "priority" | "dueAt">,
  ) => {
    const result = await chatApi.updateActionProposal(proposalId, input);
    if (!result.ok || !result.data) {
      alert(result.error || "保存待办建议失败");
      return null;
    }
    return result.data;
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
      const requestId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await chatApi.ask(question, sessionId, customerId, requestId);
      if (!result.ok || !result.data) {
        throw new Error(result.error || "请求失败");
      }
      const d = result.data;
      setSessionId(d.sessionId);
      setMessages((m) => [
        ...m,
        { id: d.messageId, role: "ai", text: d.answer, riskLevel: d.riskLevel, answerType: d.answerType, generationMode: d.generationMode, retrieved: d.retrieved, methodology: d.methodology },
      ]);
      if (wasNew) {
        router.replace(chatHref({ nextSessionId: d.sessionId }));
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
      const response = await fetch("/api/vision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl, hint, sessionId, customerId }) });
      const result = await response.json();
      if (!response.ok || !result.answer) throw new Error(result.error || "图片处理失败");
      setSessionId(result.sessionId || sessionId);
      setMessages((m) => [...m, { id: result.messageId || "ai" + Date.now(), role: "ai", text: result.answer, riskLevel: result.riskLevel, answerType: result.answerType, generationMode: result.generationMode, retrieved: result.retrieved, methodology: result.methodology }]);
      if (wasNew && result.sessionId) router.replace(chatHref({ nextSessionId: result.sessionId }));
    } catch (error: any) {
      setMessages((m) => [...m, { id: "ei" + Date.now(), role: "ai", text: `图片处理失败：${error?.message || "请稍后重试。"}` }]);
    } finally {
      setLoading(false);
    }
  }

  function previewMessage() {
    if (customerId) {
      router.push(chatHref({ newConversation: true }));
      return;
    }
    setInput("请基于上面的建议，生成一段可直接发送给客户的确认话术。");
  }

  return (
    <div className="ref-chat">
      <header className="ref-topbar">
        <button onClick={() => router.push(view === "classic" ? "/chat?view=classic" : "/chat")} className="text-left"><Brand /></button>
        <button onClick={() => router.push("/admin")} className="ref-management-pill">管理</button>
      </header>
      <CoachModeTabs active={view} />

      <main ref={scrollRef} className="ref-chat-main no-scrollbar max-h-[calc(100vh-88px)] overflow-y-auto">
        <section className="ref-card ref-context">
          <div className="mb-2 flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className="rounded bg-[#eaf7ee] px-1.5 py-0.5 text-[10px] font-bold text-[#078a4c]">{customerId ? "客户模式" : "自由对话"}</span><h2 className="truncate text-[16px] font-bold tracking-tight text-[#172119]">{customerName || "门店经营助手"}</h2></div><button onClick={() => router.push(view === "classic" ? "/chat?view=classic" : "/chat")} className="rounded-lg border border-[#b6e0c1] px-2 py-1 text-[10px] font-bold text-[#078a4c]">{customerId ? "切换客户" : "选择客户"}</button></div>
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
            <AiBubble key={m.id} m={m} onFeedback={handleFeedback} onPreview={previewMessage}
              canCreateAction={Boolean(customerId)} onCreateAction={handleCreateAction} onResolveAction={handleResolveAction} onUpdateAction={handleUpdateAction} />
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
