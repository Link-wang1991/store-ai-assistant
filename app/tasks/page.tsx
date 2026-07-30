"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BottomNav, MAIN_NAV, STAFF_NAV } from "@/components/BottomNav";
import { AppLoading } from "@/components/AppLoading";
import { customerApi, getToken, taskApi } from "@/lib/api-client";
import { decodeJwtPayload } from "@/lib/jwt";

const OUTCOMES = [
  ["accepted", "已接受"], ["scheduled", "已预约"], ["concern", "仍有顾虑"],
  ["no_reply", "未回复"], ["not_interested", "暂不考虑"], ["escalate", "需要升级"],
  ["wrong_info", "信息有误"], ["arrived", "已实际到店"], ["deal_closed", "已确认成交"],
  ["risk_resolved", "风险已解决"], ["no_show", "预约未到店"],
] as const;

const BUSINESS_OUTCOME_LABEL: Record<string, string> = {
  pending: "尚未记录业务结果",
  pending_verification: "动作已完成，业务结果待核验",
  pending_reactivation: "本次未达成，等待后续唤醒",
  verified: "业务结果已验证",
};

const RESULT_LABEL: Record<string, string> = {
  accepted: "已接受", scheduled: "已预约", concern: "仍有顾虑", no_reply: "未回复",
  not_interested: "暂不考虑", escalate: "需要升级", wrong_info: "信息有误",
  arrived: "已实际到店", deal_closed: "已确认成交", risk_resolved: "风险已解决", no_show: "预约未到店",
};

function field(task: any, ...keys: string[]) {
  for (const key of keys) if (task?.[key] !== undefined && task?.[key] !== null) return task[key];
  return undefined;
}

function sourceLabel(value: string | undefined) {
  return ({
    meeting_analysis: "会谈分析", meeting_reanalysis: "会谈修订复盘", followup_review: "会谈行动复核",
    compliance_fix: "会谈合规整改", score_coaching: "会谈质量辅导", ai_coach: "AI 教练建议", task_feedback: "上次任务反馈",
    experience_review: "会谈经验审核", memory_confirm: "客户记忆确认",
    manual_meeting_candidate: "人工提交的会谈经验",
  } as Record<string, string>)[value || ""] || "人工创建";
}

function dueByEndOfToday(value: unknown) {
  if (!value) return false;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return false;
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return date.getTime() <= end.getTime();
}

export default function TasksPage() {
  return <Suspense fallback={<AppLoading label="正在读取我的任务…" />}><TasksPageContent /></Suspense>;
}

function TasksPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const [tasks, setTasks] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const token = getToken();
    const payload = token ? decodeJwtPayload(token) : null;
    if (!payload) { router.replace("/login"); return; }
    setRole(payload.role || "");
    setLoading(true);
    const [taskResult, customerResult] = await Promise.all([taskApi.list(), customerApi.list()]);
    if (!taskResult.ok) setNotice(taskResult.error || "任务读取失败");
    setTasks(taskResult.data || []);
    setCustomers(customerResult.data || []);
    setLoading(false);
  }, [router]);

  useEffect(() => { void load(); }, [load]);
  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const nav = role === "owner" || role === "admin" || role === "manager" ? MAIN_NAV : STAFF_NAV;
  const todayOnly = searchParams.get("mode") === "today";
  const visibleTasks = todayOnly
    ? tasks.filter((task) => ["todo", "doing", "overdue"].includes(task.status || "todo") && dueByEndOfToday(field(task, "dueAt", "due_at", "deadline")))
    : tasks;

  if (loading) return <AppLoading label="正在读取我的任务…" />;

  return <div className="ref-app"><div className="ref-canvas">
    <header className="ref-topbar"><button onClick={() => router.push("/home")} className="ref-icon-button" aria-label="返回首页">←</button><div><h1 className="text-[17px] font-bold text-[#161d17]">{todayOnly ? "今日待跟进" : "我的任务"}</h1><p className="text-[10px] text-[#738077]">{todayOnly ? "仅显示今天截止或已逾期的正式待办" : "每项任务均保留客户和业务来源"}</p></div></header>
    <main className="ref-main space-y-3">
      {notice && <p role="status" className="rounded-xl border border-[#d8e6da] bg-white px-3 py-2 text-[12px] text-[#3d4a3e]">{notice}</p>}
      {visibleTasks.length === 0 ? <div className="ref-empty">{todayOnly ? "今天没有到期或逾期的正式待办。" : "暂无分配给你的待办。"}</div> : visibleTasks.map((task) => {
        const customerId = field(task, "customerId", "customer_id");
        const customer = customerId ? customerMap.get(customerId) : null;
        return <TaskCard key={task.id} task={task} customer={customer} onRefresh={load} onNotice={setNotice} />;
      })}
    </main>
  </div><BottomNav items={nav} /></div>;
}

function TaskCard({ task, customer, onRefresh, onNotice }: { task: any; customer: any; onRefresh: () => Promise<void>; onNotice: (value: string) => void }) {
  const router = useRouter();
  const [finishing, setFinishing] = useState(false);
  const [showOutcome, setShowOutcome] = useState(false);
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number][0]>("accepted");
  const [note, setNote] = useState("");
  const customerId = field(task, "customerId", "customer_id");
  const sourceMeetingId = field(task, "sourceMeetingId", "source_meeting_id");
  const sourceChatSessionId = field(task, "sourceChatSessionId", "source_chat_session_id");
  const source = sourceLabel(field(task, "sourceType", "source_type"));
  const sourceChain = Array.isArray(field(task, "sourceChain", "source_chain")) ? field(task, "sourceChain", "source_chain").map(String) : [];
  const sourceSummary = field(task, "sourceSummary", "source_summary");
  const sourceStatus = field(task, "sourceStatus", "source_status");
  const knowledgeEvidence = Array.isArray(field(task, "knowledgeEvidence", "knowledge_evidence")) ? field(task, "knowledgeEvidence", "knowledge_evidence") : [];
  const methodologyEvidence = Array.isArray(field(task, "methodologyEvidence", "methodology_evidence")) ? field(task, "methodologyEvidence", "methodology_evidence") : [];
  const dueAt = field(task, "dueAt", "due_at", "deadline");
  const status = task.status || "todo";
  const businessOutcome = String(field(task, "businessOutcomeStatus", "business_outcome_status") || "pending");
  const resultCode = String(field(task, "resultCode", "result_code") || "");
  const resultDetail = field(task, "resultDetail", "result_detail");

  async function start() {
    const result = await taskApi.updateStatus(task.id, "doing");
    if (!result.ok) { onNotice(result.error || "任务状态更新失败"); return; }
    const params = new URLSearchParams({ new: "1", q: task.content || task.title || "请协助完成这项任务" });
    if (customerId) params.set("customerId", customerId);
    router.push(`/chat?${params.toString()}`);
  }

  async function complete() {
    setFinishing(true);
    const result = await taskApi.complete(task.id, outcome, note.trim() || undefined);
    setFinishing(false);
    if (!result.ok) { onNotice(result.error || "任务结果保存失败"); return; }
    onNotice(result.data?.next_action || "已记录任务结果");
    await onRefresh();
  }

  return <article className="ref-card p-4">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-[15px] font-bold text-[#172119]">{task.title || "待处理任务"}</h2><p className="mt-1 text-[11px] text-[#6c7b6d]">{customer?.name || (customerId ? "已关联客户" : "未关联客户")} · {source}{dueAt ? ` · 截止 ${String(dueAt).slice(0, 10)}` : " · 未设截止"}</p></div><span className={`ref-status ${status === "doing" ? "ref-status-blue" : status === "done" ? "ref-status-green" : "ref-status-green"}`}>{status === "doing" ? "处理中" : status === "done" ? "动作已完成" : status === "canceled" ? "已取消" : "待处理"}</span></div>
    {task.content && <p className="mt-3 whitespace-pre-wrap text-[12px] leading-relaxed text-[#3d4a3e]">{task.content}</p>}
    <div className="mt-3 rounded-xl border border-[#d8e6da] bg-[#f7fbf6] p-3 text-[11px] leading-relaxed text-[#4a5f4e]">
      <p className="font-semibold">业务来源与闭环</p>
      <p className="mt-1">{sourceChain.length > 0 ? sourceChain.join(" → ") : source}{sourceStatus ? ` · ${sourceStatus}` : ""}</p>
      {sourceSummary && <p className="mt-1 text-[#66766a]">原始判断：{String(sourceSummary)}</p>}
      <div className="mt-2 flex flex-wrap gap-3">{customerId && <Link className="text-[#006d37] underline underline-offset-2" href={`/customers/${customerId}`}>查看客户</Link>}{sourceMeetingId && <Link className="text-[#006d37] underline underline-offset-2" href={`/meeting/${sourceMeetingId}`}>查看来源会谈</Link>}{sourceChatSessionId && <Link className="text-[#006d37] underline underline-offset-2" href={`/chat?sessionId=${encodeURIComponent(String(sourceChatSessionId))}${customerId ? `&customerId=${encodeURIComponent(String(customerId))}` : ""}`}>查看来源 AI 对话</Link>}</div>
      {knowledgeEvidence.length > 0 ? <div className="mt-2 border-t border-[#d8e6da] pt-2"><p className="font-medium text-[#4a5f4e]">当时引用的门店资料</p>{knowledgeEvidence.map((item: any, index: number) => <Link key={`${item.document_id || item.documentId || item.title}-${index}`} href={item.document_id || item.documentId ? `/knowledge?source=${encodeURIComponent(String(item.document_id || item.documentId))}` : "/knowledge"} className="mt-1 block text-[#006d37] underline underline-offset-2"><b>{item.title || "门店知识"}</b>{item.excerpt ? `：${item.excerpt}` : ""}</Link>)}</div> : <p className="mt-2 text-[#738077]">未记录门店资料引用；请以客户档案、会谈原文或人工业务依据为准。</p>}
      {methodologyEvidence.length > 0 && <div className="mt-2 border-t border-[#d8e6da] pt-2"><p className="font-medium text-[#4a5f4e]">系统销售方法论</p>{methodologyEvidence.map((item: any, index: number) => <p key={`${item.id || item.title}-${index}`} className="mt-1 text-[#66766a]"><b>{item.title || "销售方法论"}</b>{item.module ? ` · ${item.module}` : ""}{item.excerpt ? `：${item.excerpt}` : ""}</p>)}<p className="mt-1 text-[#738077]">仅用于沟通与决策策略，不替代门店规则。</p></div>}
    </div>
    {status === "done" && <div className={`mt-3 rounded-xl border p-3 text-[11px] leading-relaxed ${businessOutcome === "verified" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}><p className="font-semibold">业务结果：{BUSINESS_OUTCOME_LABEL[businessOutcome] || businessOutcome}</p>{resultCode && <p className="mt-1">本次记录：{RESULT_LABEL[resultCode] || resultCode}</p>}{resultDetail && <p className="mt-1">说明：{String(resultDetail)}</p>}{businessOutcome !== "verified" && <p className="mt-1 text-amber-800">此任务只代表动作已执行；请继续完成系统生成的核验/跟进任务，记录到店、成交或风险处理结果后才算业务闭环。</p>}</div>}
    {status !== "done" && status !== "canceled" && <div className="mt-4 flex flex-wrap gap-2">{status === "todo" && <button onClick={() => void start()} className="ref-primary px-4">开始并打开 AI 教练</button>}<button onClick={() => setShowOutcome((value) => !value)} className="ref-secondary px-4">完成并记录结果</button></div>}
    {showOutcome && <div className="mt-3 rounded-xl border border-[#d8e6da] bg-[#f7fbf6] p-3"><label className="block text-[11px] font-medium text-[#4a5f4e]">跟进结果<select value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)} className="mt-1.5 w-full rounded-lg border border-[#cfe0d1] bg-white px-2 py-2 text-[12px]">{OUTCOMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><p className="mt-1.5 text-[10px] leading-relaxed text-[#738077]">“已预约 / 已接受”只记为动作结果，系统会自动创建核验任务；只有“实际到店 / 已确认成交 / 风险已解决”才会标为已验证。</p><label className="mt-2 block text-[11px] font-medium text-[#4a5f4e]">补充说明（可选）<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1.5 w-full rounded-lg border border-[#cfe0d1] bg-white px-2 py-2 text-[12px]" /></label><button disabled={finishing} onClick={() => void complete()} className="ref-primary mt-3 w-full">{finishing ? "正在保存…" : "确认完成并写入结果"}</button></div>}
  </article>;
}
