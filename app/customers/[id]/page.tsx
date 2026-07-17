import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDataScope, canEnterAdmin } from "@/lib/permissions";
import { STAGE_LABEL } from "@/lib/opportunity";
import { SCENE_LABEL } from "@/lib/scenes";
import { ActionForm } from "@/components/ActionForm";
import { ActionButton } from "@/components/ActionButton";
import { OpportunityCard } from "@/components/OpportunityCard";
import { MemoryReview } from "@/components/MemoryReview";
import { ScrollToHash } from "@/components/ScrollToHash";
import { BottomNav, MAIN_NAV, STAFF_NAV } from "@/components/BottomNav";
import { updateCustomer, addInteraction, deleteCustomer } from "@/lib/actions";
import { fmtTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const MEM_KEY_LABEL: Record<string, string> = {
  decision_maker: "决策链", concern: "顾虑", budget_signal: "预算信号",
  preference: "偏好", taboo: "禁忌", life_event: "生活事件",
};
const KIND_LABEL: Record<string, string> = {
  ai_suggestion: "AI建议", note: "跟进", visit: "到店", call: "电话", wechat: "微信", feedback: "反馈",
};
const SOURCE_LABEL: Record<string, string> = {
  chat: "AI对话沉淀", ai: "AI对话沉淀", meeting: "会谈复盘", manual: "人工补充", feedback: "客户反馈",
};
const MEETING_STATUS: Record<string, string> = {
  recording: "录音中", transcribing: "转写中", analyzing: "AI分析中", done: "已完成", failed: "处理失败",
};

function confTag(conf?: number): { label: string; cls: string } {
  const c = typeof conf === "number" ? conf : 0.5;
  if (c >= 0.8) return { label: "高可信", cls: "bg-[var(--green-soft)] text-[var(--green-dark)]" };
  if (c >= 0.5) return { label: "中可信", cls: "bg-[var(--yellow-soft)] text-[var(--yellow)]" };
  return { label: "待确认", cls: "bg-[var(--surface-2)] text-[var(--faint)]" };
}

function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const inputCls = "w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--green)]";
const labelCls = "mb-1.5 block text-[11px] text-[var(--faint)]";
const sectionCls = "mx-4 mt-4 rounded-2xl border border-[var(--line)] bg-white p-4";
const sectionTitleCls = "mb-3 text-[15px] font-semibold text-[var(--ink)]";

export default async function CustomerProfilePage({ params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const cust: any = await db.customers.getById(params.id, ctx.store.id);
  if (!cust) notFound();

  if (getDataScope(ctx, "customers") === "self" && cust.assigned_to !== ctx.employee.id) notFound();

  const [timeline, memories, opps, meetings] = await Promise.all([
    (db.interactions.listByCustomer(params.id, ctx.store.id, 30) as Promise<any[]>).catch(() => []),
    (db.memory.listForCustomer(ctx.store.id, params.id) as Promise<any[]>).catch(() => []),
    (db.opportunities.listOpenForCustomer(ctx.store.id, params.id) as Promise<any[]>).catch(() => []),
    (db.meetings.listByCustomer(ctx.store.id, params.id, 30) as Promise<any[]>).catch(() => []),
  ]);

  const aiQuestion = `客户「${cust.name}」目前是「${STAGE_LABEL[cust.stage] || cust.stage}」，${
    cust.concerns ? `当前顾虑：${cust.concerns}。` : ""
  }请结合TA的画像和历史，判断下一步怎么跟进、用什么话术。`;

  const evidence: string[] = [];
  if (timeline[0]) {
    evidence.push(`最近一次${KIND_LABEL[timeline[0].kind] || "互动"}记录：${String(timeline[0].summary || "").slice(0, 36)}`);
  }
  if (memories.some((m) => m.source === "meeting")) evidence.push("来自会谈复盘沉淀的画像要点");
  if (timeline.some((t) => t.kind === "feedback" || t.kind === "visit")) evidence.push("来自服务后回访 / 到店记录");
  if (cust.concerns) evidence.push(`客户顾虑记录：${cust.concerns}`);
  evidence.push("结合门店知识库中的跟进策略与话术规则");

  return (
    <div className="min-h-screen bg-[var(--page)] pb-20">
      {/* 顶部栏 */}
      <div className="sticky top-0 z-30 border-b border-[var(--line)] bg-white px-4 py-3">
        <div className="relative flex items-center justify-center">
          <Link
            href="/customers"
            className="absolute left-0 flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-2)] text-center text-[15px] font-bold text-[var(--ink)] transition hover:bg-[var(--line)]"
          >
            ←
          </Link>
          <div className="text-center">
            <div className="text-[15px] font-semibold text-[var(--ink)]">客户画像</div>
            <div className="text-[11px] text-[var(--faint)]">{cust.name} · {STAGE_LABEL[cust.stage] || cust.stage}{cust.phone ? ` · ${cust.phone}` : ""}</div>
          </div>
          {canEnterAdmin(ctx) && (
            <div className="absolute right-0">
              <ActionButton
                action={deleteCustomer.bind(null, cust.id)}
                label="删除"
                confirmText={`确定删除客户「${cust.name}」？档案不可恢复，关联的会谈记录会保留但解除关联（用于清理测试/脏数据）。`}
                className="text-[11px] text-red-500"
                redirectTo="/customers"
              />
            </div>
          )}
        </div>
      </div>

      <ScrollToHash />

      {/* AI 客户画像 */}
      <section className={sectionCls}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className={sectionTitleCls}>AI 客户画像</h2>
          <Link href={`/chat?customerId=${cust.id}&q=${encodeURIComponent(aiQuestion)}`} className="rounded-lg bg-[var(--green-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--green-dark)]">
            问 AI 教练
          </Link>
        </div>
        {cust.ai_suggestion ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--muted)]">{cust.ai_suggestion}</p>
        ) : (
          <p className="text-[13px] text-[var(--faint)]">还没有 AI 画像。点「问 AI 教练」，AI 会结合这位客户的历史与门店知识库，给出判断、话术与下一步。</p>
        )}

        <div className="mt-4 border-t border-[var(--line)] pt-3">
          <div className="mb-2 text-[11px] font-medium text-[var(--faint)]">判断依据</div>
          <ul className="space-y-1.5">
            {evidence.map((e, i) => (
              <li key={i} className="flex gap-1.5 text-[11px] text-[var(--muted)]">
                <span className="text-[var(--green)]">·</span>
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* AI 记忆 */}
      <section className={sectionCls}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className={sectionTitleCls}>AI 记忆</h2>
          <span className="text-[11px] text-[var(--faint)]">对话/会谈中自动沉淀</span>
        </div>
        {memories.length === 0 ? (
          <p className="text-[13px] text-[var(--faint)]">还没有沉淀的记忆。带着这位客户向 AI 提问、或做会谈复盘后，关键事实会自动记到这里。</p>
        ) : (
          <ul className="space-y-3">
            {memories.map((m) => {
              const tag = confTag(m.confidence);
              return (
                <li key={m.key} className="border-b border-[var(--line)] pb-3 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">{MEM_KEY_LABEL[m.key] || m.key}</span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${tag.cls}`}>{tag.label}</span>
                    {m.source && <span className="text-[10px] text-[var(--faint)]">来源：{SOURCE_LABEL[m.source] || m.source}</span>}
                  </div>
                  <p className="mt-1.5 text-[13px] text-[var(--ink)]">{m.value}</p>
                  <MemoryReview customerId={cust.id} mkey={m.key} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 轻补充入口 */}
      <section className={sectionCls}>
        <div className={sectionTitleCls}>补充一句客户情况</div>
        <ActionForm action={addInteraction} submitText="补充" resetOnSuccess className="flex gap-2">
          <input type="hidden" name="customer_id" value={cust.id} />
          <input type="hidden" name="kind" value="feedback" />
          <input name="summary" placeholder="例如：客户更在意效果不在意价格…" className={inputCls} required />
        </ActionForm>
      </section>

      {/* 增长机会 */}
      {opps.length > 0 && (
        <section className={sectionCls}>
          <h2 className={sectionTitleCls}>增长机会</h2>
          <div className="space-y-2">
            {opps.map((o) => <OpportunityCard key={o.id} o={o} />)}
          </div>
        </section>
      )}

      {/* 会谈记录 */}
      {meetings.length > 0 && (
        <section id="meetings" className={sectionCls}>
          <h2 className={sectionTitleCls}>会谈记录（{meetings.length}）</h2>
          <p className="mb-3 text-[11px] text-[var(--faint)]">TA 的历次会谈都汇总在这里，按时间排列——首次咨询、成交、服务后反馈各是一个阶段</p>
          <div className="space-y-2">
            {meetings.map((m) => (
              <Link key={m.id} href={`/meeting/${m.id}`} className="block rounded-2xl border border-[var(--line)] bg-white p-3.5">
                <div className="flex items-center justify-between">
                  <div className="text-[14px] font-medium text-[var(--ink)]">
                    {SCENE_LABEL[m.scene] || m.scene}
                    {m.employees?.name && <span className="ml-2 text-[11px] text-[var(--faint)]">{m.employees.name}</span>}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${m.status === "done" ? "bg-[var(--green-soft)] text-[var(--green-dark)]" : m.status === "failed" ? "bg-[var(--red-soft)] text-[var(--red)]" : "bg-[var(--yellow-soft)] text-[var(--yellow)]"}`}>
                    {MEETING_STATUS[m.status] || m.status}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-[var(--faint)]">{fmtTime(m.created_at)}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 编辑基础资料 */}
      <details className={`${sectionCls} group`}>
        <summary className="cursor-pointer list-none text-[15px] font-medium text-[var(--ink)]">
          编辑基础资料 / 记录互动
        </summary>
        <div className="space-y-4 border-t border-[var(--line)] pt-4">
          <ActionForm action={updateCustomer} submitText="保存资料" className="space-y-3">
            <input type="hidden" name="id" value={cust.id} />
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>姓名</label><input name="name" defaultValue={cust.name || ""} className={inputCls} /></div>
              <div><label className={labelCls}>电话</label><input name="phone" defaultValue={cust.phone || ""} className={inputCls} /></div>
              <div><label className={labelCls}>来源</label><input name="source" defaultValue={cust.source || ""} placeholder="美团/小红书/转介绍" className={inputCls} /></div>
              <div>
                <label className={labelCls}>阶段</label>
                <select name="stage" defaultValue={cust.stage} className={inputCls}>
                  {Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>性格底色</label><input name="personality" defaultValue={cust.personality || ""} placeholder="谨慎理性/感性冲动" className={inputCls} /></div>
              <div><label className={labelCls}>消费能力</label><input name="spending_power" defaultValue={cust.spending_power || ""} placeholder="高/中/低" className={inputCls} /></div>
              <div><label className={labelCls}>决策风格</label><input name="decision_style" defaultValue={cust.decision_style || ""} placeholder="自己拍板/需家人同意" className={inputCls} /></div>
              <div><label className={labelCls}>沟通偏好</label><input name="communication_pref" defaultValue={cust.communication_pref || ""} placeholder="微信文字/电话" className={inputCls} /></div>
            </div>
            <div><label className={labelCls}>当前顾虑 / 成交阻碍</label><textarea name="concerns" rows={2} defaultValue={cust.concerns || ""} className={inputCls} /></div>
            <div><label className={labelCls}>复购 / 升单机会</label><textarea name="repurchase_opp" rows={2} defaultValue={cust.repurchase_opp || ""} className={inputCls} /></div>
            <div><label className={labelCls}>标签（逗号分隔）</label><input name="tags" defaultValue={(cust.tags || []).join(",")} className={inputCls} /></div>
            <div><label className={labelCls}>备注</label><textarea name="notes" rows={2} defaultValue={cust.notes || ""} className={inputCls} /></div>
            <div><label className={labelCls}>下次跟进时间</label><input name="next_follow_at" type="datetime-local" defaultValue={toLocalInput(cust.next_follow_at)} className={inputCls} /></div>
          </ActionForm>

          <ActionForm action={addInteraction} submitText="记录互动" resetOnSuccess className="space-y-3 border-t border-[var(--line)] pt-4">
            <input type="hidden" name="customer_id" value={cust.id} />
            <div className="grid grid-cols-2 gap-3">
              <select name="kind" defaultValue="note" className={inputCls}>
                <option value="note">跟进记录</option>
                <option value="wechat">微信沟通</option>
                <option value="call">电话沟通</option>
                <option value="visit">到店</option>
                <option value="feedback">客户反馈</option>
              </select>
              <input name="channel" placeholder="渠道（选填）" className={inputCls} />
            </div>
            <textarea name="summary" rows={2} placeholder="这次沟通了什么 / 客户反应 / 结果" className={inputCls} required />
            <div><label className={labelCls}>顺手定下次跟进时间（选填）</label><input name="next_follow_at" type="datetime-local" className={inputCls} /></div>
          </ActionForm>
        </div>
      </details>

      {/* 互动时间线 */}
      <section className={sectionCls}>
        <h2 className={sectionTitleCls}>互动时间线</h2>
        {timeline.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--page)] p-6 text-center text-[13px] text-[var(--faint)]">还没有互动记录</div>
        ) : (
          <div className="space-y-2">
            {timeline.map((it) => (
              <div key={it.id} className="rounded-2xl border border-[var(--line)] bg-white p-3.5">
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--muted)]">{KIND_LABEL[it.kind] || it.kind || "互动"}</span>
                  <span className="text-[11px] text-[var(--faint)]">{it.employees?.name ? it.employees.name + " · " : ""}{fmtTime(it.created_at)}</span>
                </div>
                {it.title && it.kind === "ai_suggestion" && <div className="mt-1 text-[11px] font-medium text-[var(--muted)]">问：{it.title}</div>}
                <div className="mt-1.5 whitespace-pre-wrap text-[13px] text-[var(--ink)]">{it.summary}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <BottomNav items={canEnterAdmin(ctx) ? MAIN_NAV : STAFF_NAV} />
    </div>
  );
}
