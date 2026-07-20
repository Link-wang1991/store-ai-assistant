"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/data-source";
import { getToken } from "@/lib/api-client";
import { MeetingProcessing } from "@/components/MeetingProcessing";
import { ExperienceDistill, type ExperienceCandidate } from "@/components/ExperienceDistill";
import { BottomNav, MAIN_NAV, STAFF_NAV } from "@/components/BottomNav";
import { useRecording } from "@/components/RecordingContext";
import { isAdminRole } from "@/lib/constants";
import { SCENE_LABEL } from "@/lib/scenes";
import { fmtTime } from "@/lib/format";
import { decodeJwtPayload } from "@/lib/jwt";

const STATUS_LABEL: Record<string, string> = {
  recording: "录音中", queued: "已保存，等待提交", submitting: "正在提交转写", uploaded: "已上传待处理", transcribing: "转写中", analyzing: "AI 分析中", done: "已完成", failed: "处理失败",
};
const ROLE_LABEL: Record<string, string> = {
  employee: "员工", customer: "客户", manager: "店长", other: "其他",
};

function clean(v: any): string {
  if (typeof v !== "string") return String(v ?? "");
  return v.replace(/\*\*/g, "").replace(/^#{1,6}\s*/gm, "").replace(/^\s*[-*]\s+/gm, "· ").trim();
}

function OverviewItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--green-soft)] text-[var(--green)]">{icon}</div>
      <div>
        <div className="text-[11px] text-[var(--faint)]">{label}</div>
        <div className="text-[13px] font-medium text-[var(--ink)]">{value}</div>
      </div>
    </div>
  );
}

function AnalysisCard({ icon, title, content, accent = "green" }: { icon: React.ReactNode; title: string; content: string | null | any[]; accent?: string }) {
  // [] 空数组也视为无数据
  if (!content || (Array.isArray(content) && content.length === 0)) return null;
  const accentMap: Record<string, { bg: string; text: string; border: string }> = {
    green: { bg: "bg-[var(--green-soft)]", text: "text-[var(--green)]", border: "border-emerald-100" },
    yellow: { bg: "bg-[var(--yellow-soft)]", text: "text-[var(--yellow)]", border: "border-amber-100" },
    red: { bg: "bg-[var(--red-soft)]", text: "text-[var(--red)]", border: "border-red-100" },
    blue: { bg: "bg-[var(--blue-soft)]", text: "text-[var(--blue)]", border: "border-blue-100" },
  };
  const a = accentMap[accent] || accentMap.green;
  return (
    <div className={`rounded-xl border ${a.border} bg-white p-3.5`}>
      <div className="mb-2 flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${a.bg} ${a.text}`}>{icon}</div>
        <span className="text-[13px] font-semibold text-[var(--ink)]">{title}</span>
      </div>
      <p className="text-[12px] leading-relaxed text-[var(--muted)]">{clean(content)}</p>
    </div>
  );
}

function scoreColor(v: number): string {
  if (v >= 80) return "var(--green)";
  if (v >= 60) return "var(--yellow)";
  return "var(--red)";
}

function transcriptSpeaker(t: { speaker_role?: string; speaker?: string }): string {
  const value = t.speaker_role || t.speaker || "";
  if (ROLE_LABEL[value]) return ROLE_LABEL[value];
  const match = /^speaker_(\d+)$/.exec(value);
  return match ? `说话人 ${Number(match[1]) + 1}` : value || "未区分说话人";
}

function transcriptTime(seconds: unknown): string {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return "--:--";
  const minute = Math.floor(value / 60);
  const second = Math.floor(value % 60);
  return `${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function QualityScoreCard({ score, dims }: { score: number; dims: { label: string; value: number }[] }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-2"
          style={{ borderColor: scoreColor(score) }}>
          <span className="text-[22px] font-bold leading-none" style={{ color: scoreColor(score) }}>{score}</span>
          <span className="text-[9px] text-[var(--faint)] mt-0.5">综合分</span>
        </div>
        <div className="flex-1 space-y-1.5">
          {dims.map((d) => (
            <div key={d.label}>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--muted)]">{d.label}</span>
                <span className="font-medium" style={{ color: scoreColor(d.value) }}>{d.value}</span>
              </div>
              <div className="mt-0.5 h-1.5 w-full rounded-full bg-[var(--surface-2)]">
                <div className="h-1.5 rounded-full" style={{ width: `${d.value}%`, backgroundColor: scoreColor(d.value) }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Icon({ name, className = "" }: { name: string; className?: string }) {
  const paths: Record<string, string> = {
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    lightbulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-7 7c0 2 1 3.5 2.5 5l.5.5V18h8v-3.5l.5-.5c1.5-1.5 2.5-3 2.5-5a7 7 0 0 0-7-7Z"/>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  };
  const d = paths[name] || "";
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />;
}

/** 统一 API 请求 */
function apiCall<T>(path: string): Promise<{ ok: boolean; data?: T }> {
  const t = getToken();
  return fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${t}` },
  })
    .then(r => r.json())
    .then(j => ({ ok: j.code === 200, data: j.data }));
}

export default function MeetingReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: meetingId } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [role, setRole] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [m, setM] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [trans, setTrans] = useState<any[]>([]);
  const [employeeName, setEmployeeName] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [allCustomers, setAllCustomers] = useState<any[]>([]);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [tab, setTab] = useState<"analysis" | "deep_review" | "distill" | "transcript">("analysis");
  const { isRecording, isPaused, isStopping, timer, pauseRecording, resumeRecording, stopRecording, meetingId: recMeetingId } = useRecording();
  const isCurrentRecording = isRecording && recMeetingId === meetingId;

  useEffect(() => {
    const t = getToken();
    if (!t) { router.replace("/login"); return; }

    const p = decodeJwtPayload(t);
    if (!p) { router.replace("/login"); return; }
    const r = p.role || "";
    setRole(r);
    setIsAdmin(isAdminRole(r));
    setEmployeeName(p.name || "");

    const bid = meetingId;
    Promise.allSettled([
      apiCall<any>(`/api/meetings/${bid}`),
      apiCall<any>(`/api/meetings/${bid}/analysis`),
      apiCall<any[]>(`/api/meetings/${bid}/transcripts`),
    ]).then(([mr, ar, tr]) => {
      const meeting = mr.status === "fulfilled" && mr.value?.ok ? mr.value.data : null;
      if (!meeting) { setError("会谈不存在"); setLoading(false); return; }
      setM(meeting);
      if (ar.status === "fulfilled" && ar.value?.ok && ar.value.data) {
        const list = ar.value.data;
        setAnalysis(Array.isArray(list) && list.length > 0 ? list[0] : list);
      }
      if (tr.status === "fulfilled" && tr.value?.ok && Array.isArray(tr.value.data)) setTrans(tr.value.data);
      setLoading(false);
    });
  }, [router, meetingId]);

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[var(--page)]">
      <div className="text-center">
        <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--green)]" />
        <p className="mt-3 text-sm text-[var(--faint)]">加载会谈复盘…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex h-screen flex-col items-center justify-center bg-[var(--page)] gap-3">
      <p className="text-sm text-[var(--faint)]">{error}</p>
      <Link href="/meeting" className="text-sm text-[var(--green)]">← 返回会谈列表</Link>
    </div>
  );

  const sceneName = SCENE_LABEL[m.scene] || m.scene;
  const nav = isAdmin ? MAIN_NAV : STAFF_NAV;
  const customerName = m.customer_records?.name || "临时客户";
  const hasAnalysis = analysis && (analysis.summary || analysis.key_points || analysis.explicit_needs);

  async function handleRetryTranscription() {
    if (retrying) return;
    setRetrying(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/meetings/${meetingId}/retry-transcription`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const res = await response.json().catch(() => ({}));
      if (response.ok && res.code === 200) {
        router.refresh();
      } else {
        alert(res.message || "重新提交转写失败");
      }
    } finally {
      setRetrying(false);
    }
  }

  // 优先用后端保存的 duration，其次从转写时间差计算
  let durationStr = "--";
  if (m.duration && m.duration > 0) {
    const min = Math.floor(m.duration / 60);
    const sec = m.duration % 60;
    durationStr = `${min}分${sec}秒`;
  } else if (trans.length >= 2) {
    const first = new Date(trans[0].created_at).getTime();
    const last = new Date(trans[trans.length - 1].created_at).getTime();
    const diff = Math.round((last - first) / 1000);
    const min = Math.floor(diff / 60);
    const sec = diff % 60;
    durationStr = `${min}分${sec}秒`;
  }

  const distill: ExperienceCandidate[] = [];
  if (analysis?.suggested_script) distill.push({ title: `${sceneName} · 有效回应话术`, content: analysis.suggested_script });
  if (analysis?.employee_did_well) distill.push({ title: `${sceneName} · 值得复制的做法`, content: analysis.employee_did_well });
  if (analysis?.followup_goal) distill.push({ title: `${sceneName} · 跟进流程`, content: analysis.followup_goal });

  return (
    <div className="min-h-screen bg-[var(--page)] pb-20">
      {/* 顶部 - 粘性保持可见 */}
      <div className="sticky top-0 z-30 bg-white border-b border-[var(--line)] px-4 py-3">
        <div className="relative flex items-center justify-center">
          <button onClick={() => router.push("/meeting")} className="absolute left-0 flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--ink)] text-[15px] font-bold hover:bg-[var(--line)] transition">←</button>
          <span className="text-[15px] font-semibold text-[var(--ink)]">会谈详情</span>
        </div>
      </div>

      {/* 录音横幅 + Tab 切换 — 同一 sticky 容器 */}
      <div className="sticky top-[52px] z-20">
      {isCurrentRecording && (
        <div className="border-b border-[var(--green)] bg-[var(--green-soft)] px-4 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--green)]" />
              <span className="font-mono text-[18px] font-bold text-[var(--ink)]">{timer}</span>
              <span className="text-[12px] text-[var(--faint)]">{isStopping ? "上传中…" : isPaused ? "已暂停" : "录音中"}</span>
            </div>
            {!isStopping && (
              <div className="flex items-center gap-2">
                <button onClick={() => { isPaused ? resumeRecording() : pauseRecording(); }} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[var(--yellow)] shadow-sm active:scale-90 transition">
                  {isPaused ? (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  )}
                </button>
                <button onClick={() => { if (!isStopping) stopRecording(); }} className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-white shadow-sm active:scale-90 transition">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="flex border-b border-[var(--line)] bg-white">
        {(["analysis", "deep_review", "distill", "transcript"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2.5 text-center text-[13px] font-medium border-b-2 transition ${tab === t ? "border-[var(--green)] text-[var(--ink)]" : "border-transparent text-[var(--faint)]"}`}>
            {t === "analysis" ? "分析概览" : t === "deep_review" ? "深度复盘" : t === "distill" ? "沉淀经验" : "对话记录"}
          </button>
        ))}
      </div>
      </div>

      {/* 分析概览 Tab */}
      {tab === "analysis" && (<>
      <div className="mx-4 mt-4">
        <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
          <div className="grid grid-cols-2 gap-4">
            <OverviewItem icon={<Icon name="clock" className="h-4 w-4" />} label="会谈时长" value={durationStr} />
            <OverviewItem icon={<Icon name="check" className="h-4 w-4" />} label="会谈时间" value={fmtTime(m.created_at)} />
            <div className="relative">
              <OverviewItem
                icon={<Icon name="user" className="h-4 w-4" />}
                label="客户"
                value={
                  <button onClick={() => {
                    setEditName(customerName);
                    setEditPhone(m.customer_records?.phone || "");
                    setEditingCustomer(true);
                    fetch(`${API_BASE_URL}/api/customers`, { headers: { Authorization: `Bearer ${getToken()}` } })
                      .then(r => r.json()).then(j => { if (j.code === 200) setAllCustomers(j.data || []); }).catch(() => {});
                  }} className="text-left underline decoration-dotted underline-offset-2 hover:text-[var(--green)] transition">
                    {customerName}
                  </button>
                }
              />
              <span className="text-[10px] text-[var(--faint)]">点击可编辑或绑定已有客户</span>
              {editingCustomer && (
                <div className="meeting-customer-popover absolute left-0 top-full z-10 mt-2 rounded-2xl border border-[var(--line)] bg-white p-4 shadow-xl">
                  <h3 className="mb-3 text-[13px] font-semibold text-[var(--ink)]">编辑客户信息</h3>
                  <div className="space-y-2.5">
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                      placeholder="客户姓名" className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-[13px] outline-none focus:border-[var(--green)]" />
                    <input value={editPhone} onChange={e => setEditPhone(e.target.value)}
                      placeholder="手机号" className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-[13px] outline-none focus:border-[var(--green)]" />

                    <div className="border-t border-[var(--line)] pt-2">
                      <p className="mb-1 text-[11px] text-[var(--faint)]">或关联已有客户：</p>
                      <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                        placeholder="搜索客户…" className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-[12px] outline-none focus:border-[var(--green)]" />
                      <div className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
                        {allCustomers
                          .filter((c: any) => !customerSearch || c.name?.includes(customerSearch) || c.phone?.includes(customerSearch))
                          .slice(0, 6).map((c: any) => (
                            <button key={c.id} onClick={async () => {
                              setSavingCustomer(true);
                              try {
                                await fetch(`${API_BASE_URL}/api/meetings/${meetingId}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
                                  body: JSON.stringify({ customer_id: c.id }),
                                });
                                setEditingCustomer(false);
                                window.location.reload();
                              } finally { setSavingCustomer(false); }
                            }} className="w-full rounded-lg px-2.5 py-1.5 text-left text-[12px] hover:bg-[var(--surface-2)] transition">
                              {c.name}{c.phone ? ` · ${c.phone}` : ""}
                            </button>
                          ))}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setEditingCustomer(false)} disabled={savingCustomer}
                        className="flex-1 rounded-full border border-[var(--line)] py-2 text-[12px] text-[var(--muted)] disabled:opacity-50">取消</button>
                      <button onClick={async () => {
                        setSavingCustomer(true);
                        try {
                          await fetch(`${API_BASE_URL}/api/customers/${m.customer_id}/update`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
                            body: JSON.stringify({ name: editName, phone: editPhone }),
                          });
                          setEditingCustomer(false);
                          window.location.reload();
                        } finally { setSavingCustomer(false); }
                      }} disabled={savingCustomer}
                        className="flex-1 rounded-full bg-[var(--green)] py-2 text-[12px] font-medium text-white disabled:opacity-50">{savingCustomer ? "保存中…" : "保存"}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <OverviewItem icon={<Icon name="user" className="h-4 w-4" />} label="参与员工" value={m.employee_name || employeeName || "--"} />
          </div>
        </div>
      </div>

      {/* 分析卡片 */}
      <div className="mx-4 mt-4">
        {m.status !== "done" ? (
          ["queued", "submitting", "transcribing", "analyzing"].includes(m.status) ? (
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <MeetingProcessing id={meetingId} initialStatus={m.status} />
              {m.status === "transcribing" && !m.asr_task_id && (
                <div className="mt-4 border-t border-[var(--line)] pt-3 text-center">
                  <button
                    onClick={handleRetryTranscription}
                    disabled={retrying}
                    className="rounded-full bg-[var(--green)] px-4 py-2 text-[12px] font-medium text-white disabled:opacity-50"
                  >
                    {retrying ? "提交中…" : "重新提交转写"}
                  </button>
                  <p className="mt-1 text-[10px] text-[var(--faint)]">卡在转写中较久？可尝试重新提交</p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="text-sm text-[var(--muted)]">
                <p>当前状态：{STATUS_LABEL[m.status] || m.status}。</p>
                {m.status === "failed" ? (
                  <>
                    <p className="mt-1">{m.fail_reason || "转写未能识别到有效语音，建议重新录制一段。"}</p>
                    {m.audio_url && <button onClick={handleRetryTranscription} disabled={retrying} className="mt-2 mr-2 rounded-full border border-[var(--green)] px-4 py-1.5 text-[12px] font-medium text-[var(--green)] disabled:opacity-50">{retrying ? "提交中…" : "重新提交转写"}</button>}
                    <Link href="/meeting" className="mt-2 inline-block rounded-full bg-[var(--green)] px-4 py-1.5 text-[12px] font-medium text-white">去重新录音</Link>
                  </>
                ) : m.status === "recording" ? (
                  isCurrentRecording ? <p>录音进行中，上方可暂停或结束。</p> : <p>这次录音未完成上传。</p>
                ) : (
                  <p>稍后刷新查看。</p>
                )}
              </div>
            </div>
          )
        ) : !hasAnalysis ? (
          <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
            <p className="text-sm text-[var(--faint)]">暂无分析报告。</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <AnalysisCard icon={<Icon name="message" className="h-4 w-4" />} title="会谈摘要" content={analysis.summary || analysis.key_points} accent="green" />
              <AnalysisCard icon={<Icon name="lightbulb" className="h-4 w-4" />} title="真实需求" content={analysis.explicit_needs || analysis.implicit_needs} accent="blue" />
              <AnalysisCard icon={<Icon name="alert" className="h-4 w-4" />} title="主要顾虑" content={analysis.decision_barriers} accent="yellow" />
              <AnalysisCard icon={<Icon name="star" className="h-4 w-4" />} title="员工亮点" content={analysis.employee_did_well} accent="green" />
              <AnalysisCard icon={<Icon name="target" className="h-4 w-4" />} title="错失机会" content={analysis.missed_opportunities} accent="yellow" />
              <AnalysisCard icon={<Icon name="shield" className="h-4 w-4" />} title="合规风险" content={analysis.compliance_risks} accent="red" />
            </div>

            {/* 量化评分 */}
            <div className="mt-3">
              <QualityScoreCard
                score={Number(analysis.quality_score ?? 60)}
                dims={[
                  { label: "需求挖掘", value: Number(analysis.need_digging_score ?? 60) },
                  { label: "成交推进", value: Number(analysis.deal_advancing_score ?? 60) },
                  { label: "合规表现", value: Number(analysis.compliance_score ?? 60) },
                  { label: "服务体验", value: Number(analysis.service_score ?? 60) },
                ]}
              />
            </div>

            {/* 下一步跟进 */}
            {(analysis.followup_goal || analysis.suggested_script) && (
              <div className="mt-3 rounded-2xl border border-[var(--green)]/20 bg-[var(--green-soft)]/40 p-4">
                <div className="mb-2 text-[14px] font-semibold text-[var(--green-dark)]">下一步跟进</div>
                {analysis.followup_goal && <div className="mb-2"><div className="text-[11px] text-[var(--faint)]">跟进目标</div><div className="text-[13px] leading-relaxed text-[var(--muted)]">{clean(analysis.followup_goal)}</div></div>}
                {analysis.suggested_script && <div><div className="text-[11px] text-[var(--faint)]">建议话术</div><div className="detail-inner-surface mt-1 p-3 text-[13px] leading-relaxed text-[var(--ink)]">{clean(analysis.suggested_script)}</div></div>}
              </div>
            )}
          </>
        )}
      </div>
      </>)}

      {/* 深度复盘 Tab */}
      {tab === "deep_review" && m.status === "done" && hasAnalysis && (
      <div className="mx-4 mt-4">
        {(analysis.emotional_needs || analysis.employee_to_improve) ? (
          <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
            <div className="mb-3 text-[14px] font-semibold text-[var(--ink)]">深度复盘</div>
            {analysis.emotional_needs && <div className="mb-3"><div className="text-[11px] text-[var(--faint)]">情绪 / 深层需求</div><div className="text-[13px] leading-relaxed text-[var(--muted)]">{clean(analysis.emotional_needs)}</div></div>}
            {analysis.employee_to_improve && <div><div className="text-[11px] text-[var(--faint)]">不到位 / 后续要规避的</div><div className="text-[13px] leading-relaxed text-[var(--muted)]">{clean(analysis.employee_to_improve)}</div></div>}
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
            <p className="text-sm text-[var(--faint)]">暂无深度复盘内容</p>
          </div>
        )}
      </div>
      )}

      {/* 沉淀经验 Tab */}
      {tab === "distill" && m.status === "done" && (
      <div className="mx-4 mt-4">
        <ExperienceDistill candidates={distill} />
      </div>
      )}

      {/* 记录详情 Tab */}
      {tab === "transcript" && (<>
      {trans.length > 0 ? (<section id="transcript" className="mx-4 mt-4">
          <div className="mb-3 rounded-2xl border border-[var(--green-light)] bg-[var(--green-soft)] p-3.5">
            <h2 className="text-[15px] font-semibold text-[var(--ink)]">逐字转写原文</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">以下内容按录音时间顺序保存，未经过 AI 总结或改写；分析报告基于这些原文生成。</p>
            {m.audio_url && (
              <div className="detail-inner-surface mt-3 p-2.5">
                <div className="mb-1.5 text-[11px] font-medium text-[var(--muted)]">原始录音</div>
                <audio controls preload="metadata" className="h-9 w-full" src={`/api/meeting/${meetingId}/audio`}>
                  当前浏览器不支持录音播放。
                </audio>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {trans.map((t: any) => (
              <div key={t.id} className="rounded-2xl border border-[var(--line)] bg-white p-3.5">
                <div className="mb-1 flex items-center justify-between text-[11px] font-medium">
                  <span className="text-[var(--green)]">{transcriptSpeaker(t)}</span>
                  <span className="font-normal text-[var(--faint)]">{transcriptTime(t.start_time)} – {transcriptTime(t.end_time)}</span>
                </div>
                <div className="text-[13px] text-[var(--muted)]">{t.content}</div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="mx-4 mt-4 rounded-2xl border border-dashed border-[var(--line)] bg-white p-6 text-center">
          <p className="text-[13px] text-[var(--faint)]">暂无转写记录</p>
        </div>
      )}</>)}

      <BottomNav items={nav} />
    </div>
  );
}
