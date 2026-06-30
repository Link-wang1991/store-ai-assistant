import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";
import { ActionButton } from "@/components/ActionButton";
import { MeetingProcessing } from "@/components/MeetingProcessing";
import { ExperienceDistill, type ExperienceCandidate } from "@/components/ExperienceDistill";
import { deleteMeetingRecording, deleteMeeting, reanalyzeMeeting } from "@/lib/actions";
import { canEnterAdmin } from "@/lib/permissions";
import { BottomNav, MAIN_NAV, STAFF_NAV } from "@/components/BottomNav";
import { SCENE_LABEL } from "@/lib/scenes";
import { fmtTime } from "@/lib/format";

export const dynamic = "force-dynamic";
const STATUS_LABEL: Record<string, string> = {
  recording: "录音中", transcribing: "转写中", analyzing: "AI 分析中", done: "已完成", failed: "处理失败",
};
const ROLE_LABEL: Record<string, string> = {
  employee: "员工", customer: "客户", manager: "店长", other: "其他",
};

// 清理 AI 输出里的裸 markdown 符号，避免"排版乱七八糟"
function clean(v: any): string {
  if (typeof v !== "string") return String(v ?? "");
  return v
    .replace(/\*\*/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "· ")
    .trim();
}

function Field({ label, value }: { label: string; value: any }) {
  if (!value || (typeof value === "string" && !value.trim())) return null;
  return (
    <div className="mb-2">
      {label && <div className="text-[11px] text-slate-400">{label}</div>}
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{clean(value)}</div>
    </div>
  );
}

export default async function MeetingReportPage({ params }: { params: { id: string } }) {
  const ctx = (await getAuthContext())!;
  if (!ctx) redirect("/login");

  const m: any = await db.meetings.getById(params.id, ctx.store.id);
  if (!m) notFound();

  // 权限：员工只能看自己的；店长/老板可看本店
  const isMgr = ["owner", "manager"].includes(ctx.baseRole);
  if (m.employee_id !== ctx.employee.id && !isMgr) redirect("/meeting");

  // 合规：访问转写/报告留痕
  await db.meetingAccessLogs.log({
    store_id: ctx.store.id, meeting_id: params.id, employee_id: ctx.employee.id, action: "view_transcript",
  }).catch(() => {});

  const a: any = await db.meetingAnalysis.getByMeeting(params.id, ctx.store.id);
  const trans = (await db.meetingTranscripts.listByMeeting(params.id, ctx.store.id)) as any[];

  // 可沉淀为门店经验：从复盘里提炼可复用的做法/话术/流程
  const sceneName = SCENE_LABEL[m.scene] || m.scene;
  const distill: ExperienceCandidate[] = [];
  if (a?.suggested_script) distill.push({ title: `${sceneName} · 有效回应话术`, content: a.suggested_script });
  if (a?.employee_did_well) distill.push({ title: `${sceneName} · 值得复制的做法`, content: a.employee_did_well });
  if (a?.followup_goal) distill.push({ title: `${sceneName} · 跟进流程`, content: a.followup_goal });

  return (
    <div className="min-h-screen pb-16">
      <PageHeader
        title={`${m.customer_records?.name || "临时客户"} · 会谈复盘`}
        subtitle={`${SCENE_LABEL[m.scene] || m.scene} · ${fmtTime(m.created_at)} · ${m.employees?.name || ""}`}
      />
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-3 text-xs">
            <Link href="/meeting" className="text-brand-dark">会谈</Link>
            <Link href="/work" className="text-slate-500">工作台</Link>
          </div>
          <div className="flex gap-3">
            {m.status === "done" && (
              <ActionButton
                action={reanalyzeMeeting.bind(null, m.id)}
                label="重新分析"
                confirmText="用最新 AI 重新分析这次会谈？会覆盖现有复盘报告。"
                className="text-xs text-[var(--green-dark)]"
              />
            )}
            {m.audio_url && (
              <ActionButton
                action={deleteMeetingRecording.bind(null, m.id)}
                label="删除录音"
                confirmText="删除录音后无法再听原声，但复盘报告保留。确定删除？"
                className="text-xs text-slate-400"
              />
            )}
            <ActionButton
              action={deleteMeeting.bind(null, m.id)}
              label="删除会谈"
              confirmText="将删除这次会谈的录音、转写和复盘报告，且不可恢复。确定删除？"
              className="text-xs text-red-500"
              redirectTo={isMgr ? "/admin/meetings" : "/meeting"}
            />
          </div>
        </div>

        {m.status !== "done" ? (
          m.status === "transcribing" || m.status === "analyzing" ? (
            <Card><MeetingProcessing id={params.id} initialStatus={m.status} /></Card>
          ) : (
            <Card>
              <p className="text-sm text-slate-500">
                当前状态：{STATUS_LABEL[m.status] || m.status}。
                {m.status === "failed" ? "这次转写没成功（多为录音格式/网络问题）。" : m.status === "recording" ? "这次录音未完成上传。" : "稍后刷新查看。"}
              </p>
              {(m.status === "failed" || m.status === "recording") && (
                <div className="mt-3 flex gap-2">
                  <Link href="/meeting" className="inline-block rounded-lg bg-[var(--green-soft)] px-4 py-2 text-sm font-medium text-[var(--green-dark)]">
                    重新录制一次
                  </Link>
                  <ActionButton
                    action={deleteMeeting.bind(null, m.id)}
                    label="删除这条"
                    confirmText="删除这条失败/未完成的会谈记录？"
                    className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-slate-500"
                    redirectTo={isMgr ? "/admin/meetings" : "/meeting"}
                  />
                </div>
              )}
            </Card>
          )
        ) : !a ? (
          <Card><p className="text-sm text-slate-400">暂无分析报告。</p></Card>
        ) : (
          <>
            {a.need_manager_involved && (
              <Card className="border-amber-200 bg-amber-50">
                <p className="text-sm font-medium text-amber-800">建议店长/老板介入跟进这单</p>
              </Card>
            )}

            <Card>
              <div className="mb-2 text-sm font-semibold text-slate-700">会谈摘要</div>
              <Field label="" value={a.summary} />
              <Field label="谈话重点" value={a.key_points} />
            </Card>

            <Card>
              <div className="mb-2 text-sm font-semibold text-slate-800">① 客户潜在需求</div>
              <Field label="显性需求（客户明说的）" value={a.explicit_needs} />
              <Field label="隐性需求（没明说但存在）" value={a.implicit_needs} />
              {!a.explicit_needs && !a.implicit_needs && <p className="text-xs text-slate-400">本次未识别到明确需求。</p>}
            </Card>

            <Card>
              <div className="mb-2 text-sm font-semibold text-slate-800">② 客户顾虑 / 没成交的卡点</div>
              <Field label="" value={a.decision_barriers} />
              {!a.decision_barriers && <p className="text-xs text-slate-400">本次未识别到明显顾虑。</p>}
            </Card>

            <Card>
              <div className="mb-2 text-sm font-semibold text-slate-800">③ 客户性格色彩</div>
              <Field label="性格底色" value={a.customer_personality} />
              <Field label="沟通偏好" value={a.customer_comm_pref} />
              <Field label="消费能力" value={a.customer_spending_power} />
              {!a.customer_personality && !a.customer_comm_pref && !a.customer_spending_power && <p className="text-xs text-slate-400">本次会谈信息不足以判断。</p>}
            </Card>

            <Card>
              <div className="mb-2 text-sm font-semibold text-slate-800">④ 还没挖到的潜在痛点</div>
              <Field label="情绪 / 深层需求" value={a.emotional_needs} />
              <Field label="本次错失、下次该抓的点" value={a.missed_opportunities} />
              {!a.emotional_needs && !a.missed_opportunities && <p className="text-xs text-slate-400">本次未发现明显遗漏。</p>}
            </Card>

            <Card>
              <div className="mb-2 text-sm font-semibold text-slate-800">⑤ 美容师沟通复盘</div>
              <Field label="聊得好的地方" value={a.employee_did_well} />
              <Field label="不到位 / 后续要规避的" value={a.employee_to_improve} />
            </Card>

            {(a.service_experience_risk || a.compliance_risks) && (
              <Card className="border-red-100">
                <div className="mb-2 text-sm font-semibold text-slate-700">风险提示</div>
                <Field label="服务体验风险" value={a.service_experience_risk} />
                <Field label="合规风险" value={a.compliance_risks} />
              </Card>
            )}

            <Card className="border-brand/30 bg-brand/5">
              <div className="mb-2 text-sm font-semibold text-brand-dark">下一步跟进</div>
              <Field label="跟进目标" value={a.followup_goal} />
              <Field label="建议跟进时间" value={a.suggested_followup_at ? fmtTime(a.suggested_followup_at) : null} />
              <Field label="建议话术（可直接说）" value={a.suggested_script} />
              <p className="mt-1 text-[11px] text-slate-400">已自动写入客户记忆与增长机会，可在客户档案与作战室查看。</p>
            </Card>

            {/* 可沉淀为门店经验 */}
            <ExperienceDistill candidates={distill} />

            {/* ⑥ 完整录音翻译 */}
            {trans.length > 0 && (
              <section>
                <h2 className="mb-2 px-1 text-sm font-semibold text-slate-800">⑥ 录音翻译（完整对话）</h2>
                <div className="space-y-2">
                  {trans.map((t) => (
                    <Card key={t.id}>
                      <div className="mb-0.5 text-[11px] font-medium text-brand-dark">
                        {ROLE_LABEL[t.speaker_role] || t.speaker_role || t.speaker}
                      </div>
                      <div className="text-sm text-slate-700">{t.content}</div>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
      <BottomNav items={canEnterAdmin(ctx) ? MAIN_NAV : STAFF_NAV} />
    </div>
  );
}
