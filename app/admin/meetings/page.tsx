import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Card, StatCard, SectionHeader } from "@/components/ui";
import { fmtTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const SCENE_LABEL: Record<string, string> = {
  new_consult: "新客咨询", project_intro: "项目介绍", deal_consult: "成交咨询",
  pre_service: "服务前沟通", in_service: "服务中沟通", post_service: "服务后反馈",
  repurchase: "老客复购", complaint: "客诉处理",
};
const OPP_TYPE: Record<string, string> = {
  followup: "跟进推进", reactivation: "唤醒老客", upsell: "升单复购", recovery: "服务补救",
  new_lead: "新客转化", trial_unclosed: "体验促单", dormant: "老客唤醒", vip_care: "高客维护",
  campaign_fit: "活动邀约", post_service: "服务回访",
};

const hasRisk = (s?: string | null) => !!s && !/^无$|^没有|^暂无/.test(s.trim());

export default async function AdminMeetingsPage() {
  const ctx = (await getAuthContext())!;
  const storeId = ctx.store.id;

  const [analyses, openOpps] = await Promise.all([
    db.meetingAnalysis.listByStore(storeId, 100),
    db.opportunities.listOpen(storeId, 50),
  ]);

  const risky = (analyses as any[]).filter((a) => hasRisk(a.service_experience_risk) || hasRisk(a.compliance_risks));

  // 员工成长建议：按员工汇总待改进点
  const byEmp: Record<string, string[]> = {};
  for (const a of analyses as any[]) {
    if (!a.employee_to_improve) continue;
    const n = a.employees?.name || "未知员工";
    (byEmp[n] = byEmp[n] || []).push(a.employee_to_improve);
  }

  // 未成交原因 / 错失机会
  const unclosed = (analyses as any[]).filter((a) => a.missed_opportunities || a.decision_barriers);

  // 会谈产出的客户机会
  const meetingOpps = (openOpps as any[]).filter((o) => o.source === "meeting");

  return (
    <div>
      <PageHeader title="会谈复盘" subtitle="全店会谈洞察：机会、员工短板、体验风险、未成交原因" />
      <div className="space-y-4 p-4">
        <section>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="会谈复盘" value={analyses.length} accent="text-brand-dark" />
            <StatCard label="体验/合规风险" value={risky.length} accent="text-red-600" />
            <StatCard label="会谈机会" value={meetingOpps.length} accent="text-emerald-600" />
          </div>
        </section>

        {/* 服务体验 / 合规风险 */}
        <section>
          <SectionHeader title="服务体验 / 合规风险" />
          {risky.length === 0 ? (
            <Card><p className="text-sm text-slate-400">近期会谈未发现明显风险 👍</p></Card>
          ) : (
            <div className="space-y-2">
              {risky.slice(0, 8).map((a) => (
                <Link key={a.id} href={`/meeting/${a.meeting_id}`} className="block">
                  <Card className="border-red-100">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{a.customer_records?.name || "客户"} · {SCENE_LABEL[a.meeting_sessions?.scene] || ""}</span>
                      <span>{a.employees?.name}</span>
                    </div>
                    {hasRisk(a.service_experience_risk) && <p className="mt-1 text-sm text-slate-700">服务：{a.service_experience_risk}</p>}
                    {hasRisk(a.compliance_risks) && <p className="mt-1 text-sm text-red-600">合规：{a.compliance_risks}</p>}
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 员工成长建议 */}
        <Card>
          <div className="mb-2 text-sm font-semibold text-slate-700">员工成长建议</div>
          {Object.keys(byEmp).length === 0 ? (
            <p className="text-sm text-slate-400">暂无沉淀的员工沟通短板。</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(byEmp).map(([name, items]) => (
                <div key={name}>
                  <div className="text-xs font-medium text-slate-600">{name}（{items.length} 次会谈提到）</div>
                  <ul className="mt-1 space-y-0.5">
                    {items.slice(0, 3).map((t, i) => (
                      <li key={i} className="whitespace-pre-wrap text-xs text-slate-500">· {t.replace(/^·\s*/gm, "").slice(0, 120)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 会谈产出的客户机会 */}
        <section>
          <SectionHeader title="会谈产出的客户机会" />
          {meetingOpps.length === 0 ? (
            <Card><p className="text-sm text-slate-400">暂无来自会谈的增长机会。</p></Card>
          ) : (
            <div className="space-y-2">
              {meetingOpps.slice(0, 8).map((o) => (
                <Card key={o.id}>
                  <div className="text-sm font-medium text-slate-800">
                    {o.customer_records?.name || "客户"}
                    <span className="ml-2 text-xs text-emerald-700">{OPP_TYPE[o.type] || o.type}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{o.title}</div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* 未成交原因 / 错失机会 */}
        <Card>
          <div className="mb-2 text-sm font-semibold text-slate-700">未成交原因 / 错失机会</div>
          {unclosed.length === 0 ? (
            <p className="text-sm text-slate-400">暂无相关沉淀。</p>
          ) : (
            <div className="space-y-2">
              {unclosed.slice(0, 6).map((a) => (
                <div key={a.id} className="border-b border-slate-50 pb-2 last:border-0">
                  <div className="text-xs text-slate-500">{a.customer_records?.name || "客户"} · {SCENE_LABEL[a.meeting_sessions?.scene] || ""}</div>
                  {a.decision_barriers && <p className="mt-0.5 text-xs text-amber-700">阻碍：{a.decision_barriers.slice(0, 100)}</p>}
                  {a.missed_opportunities && <p className="mt-0.5 text-xs text-slate-500">错失：{a.missed_opportunities.replace(/^·\s*/gm, "").slice(0, 100)}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 最近会谈复盘 */}
        <section>
          <SectionHeader title="最近会谈复盘" />
          {analyses.length === 0 ? (
            <Card><p className="text-sm text-slate-400">还没有会谈复盘。员工在「会谈」里录制后会出现在这里。</p></Card>
          ) : (
            <div className="space-y-2">
              {(analyses as any[]).slice(0, 15).map((a) => (
                <Link key={a.id} href={`/meeting/${a.meeting_id}`} className="block rounded-xl border border-slate-200/70 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-slate-800">
                      {a.customer_records?.name || "临时客户"}
                      <span className="ml-2 text-xs text-slate-400">{SCENE_LABEL[a.meeting_sessions?.scene] || ""}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">{a.employees?.name}</span>
                  </div>
                  {a.summary && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{a.summary}</p>}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
