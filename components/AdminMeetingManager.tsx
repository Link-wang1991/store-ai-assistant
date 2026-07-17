"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, StatCard, SectionHeader } from "@/components/ui";
import { fmtTime } from "@/lib/format";

const SCENE_LABEL: Record<string, string> = {
  new_consult: "新客咨询",
  project_intro: "项目介绍",
  deal_consult: "成交咨询",
  pre_service: "服务前沟通",
  in_service: "服务中沟通",
  post_service: "服务后反馈",
  repurchase: "老客复购",
  complaint: "客诉处理",
};

const OPP_TYPE: Record<string, string> = {
  followup: "跟进推进",
  reactivation: "唤醒老客",
  upsell: "升单复购",
  recovery: "服务补救",
  new_lead: "新客转化",
  trial_unclosed: "体验促单",
  dormant: "老客唤醒",
  vip_care: "高客维护",
  campaign_fit: "活动邀约",
  post_service: "服务回访",
};

function hasRisk(s?: string | null) {
  return !!s && !/^无$|^没有|^暂无/.test(s.trim());
}

type Employee = { id: string; name: string };
type Meeting = {
  id: string;
  employee_id?: string;
  customer_id?: string;
  scene?: string;
  created_at?: string;
};

export function AdminMeetingManager({
  analyses,
  meetings,
  employees,
  openOpps,
  customers,
}: {
  analyses: any[];
  meetings: Meeting[];
  employees: Employee[];
  openOpps: any[];
  customers: any[];
}) {
  const [selectedEmp, setSelectedEmp] = useState<string>("all");

  const meetingMap = useMemo(
    () => Object.fromEntries(meetings.map((m) => [m.id, m])),
    [meetings]
  );
  const customerMap = useMemo(
    () => Object.fromEntries(customers.map((c) => [c.id, c])),
    [customers]
  );
  const empMap = useMemo(
    () => Object.fromEntries(employees.map((e) => [e.id, e])),
    [employees]
  );

  const enriched = useMemo(
    () =>
      analyses.map((a) => {
        const m = meetingMap[a.meeting_id];
        return {
          ...a,
          _employeeId: m?.employee_id,
          _scene: m?.scene,
          _customer: m?.customer_id ? customerMap[m.customer_id] : undefined,
        };
      }),
    [analyses, meetingMap, customerMap]
  );

  const filtered = useMemo(
    () =>
      selectedEmp === "all"
        ? enriched
        : enriched.filter((a) => a._employeeId === selectedEmp),
    [enriched, selectedEmp]
  );

  const risky = filtered.filter(
    (a) => hasRisk(a.service_experience_risk) || hasRisk(a.compliance_risks)
  );

  const byEmp: Record<string, string[]> = {};
  for (const a of filtered) {
    if (!a.employee_to_improve) continue;
    const n = empMap[a._employeeId]?.name || "未知员工";
    (byEmp[n] = byEmp[n] || []).push(a.employee_to_improve);
  }

  const unclosed = filtered.filter(
    (a) => a.missed_opportunities || a.decision_barriers
  );

  const meetingOpps = openOpps.filter(
    (o) =>
      o.source === "meeting" &&
      (selectedEmp === "all" || o.employee_id === selectedEmp)
  );

  const selectCls =
    "w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--green)]";

  return (
    <div className="space-y-4 p-4">
      {/* 员工筛选 */}
      <Card>
        <label className="mb-1.5 block text-[11px] text-[var(--faint)]">
          筛选店员
        </label>
        <select
          className={selectCls}
          value={selectedEmp}
          onChange={(e) => setSelectedEmp(e.target.value)}
        >
          <option value="all">全部店员</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </Card>

      <section>
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="会谈复盘"
            value={filtered.length}
            accent="text-brand-dark"
          />
          <StatCard
            label="体验/合规风险"
            value={risky.length}
            accent="text-red-600"
          />
          <StatCard
            label="会谈机会"
            value={meetingOpps.length}
            accent="text-emerald-600"
          />
        </div>
      </section>

      {/* 服务体验 / 合规风险 */}
      <section>
        <SectionHeader title="服务体验 / 合规风险" />
        {risky.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-400">近期会谈未发现明显风险</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {risky.slice(0, 8).map((a) => (
              <Link key={a.id} href={`/meeting/${a.meeting_id}`} className="block">
                <Card className="border-red-100">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {a._customer?.name || "客户"} ·{" "}
                      {SCENE_LABEL[a._scene] || ""}
                    </span>
                    <span>{empMap[a._employeeId]?.name || "未知员工"}</span>
                  </div>
                  {hasRisk(a.service_experience_risk) && (
                    <p className="mt-1 text-sm text-slate-700">
                      服务：{a.service_experience_risk}
                    </p>
                  )}
                  {hasRisk(a.compliance_risks) && (
                    <p className="mt-1 text-sm text-red-600">
                      合规：{a.compliance_risks}
                    </p>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 员工成长建议 */}
      <Card>
        <div className="mb-2 text-sm font-semibold text-slate-700">
          员工成长建议
        </div>
        {Object.keys(byEmp).length === 0 ? (
          <p className="text-sm text-slate-400">暂无沉淀的员工沟通短板。</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(byEmp).map(([name, items]) => (
              <div key={name}>
                <div className="text-xs font-medium text-slate-600">
                  {name}（{items.length} 次会谈提到）
                </div>
                <ul className="mt-1 space-y-0.5">
                  {items.slice(0, 3).map((t, i) => (
                    <li
                      key={i}
                      className="whitespace-pre-wrap text-xs text-slate-500"
                    >
                      · {t.replace(/^·\s*/gm, "").slice(0, 120)}
                    </li>
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
          <Card>
            <p className="text-sm text-slate-400">暂无来自会谈的增长机会。</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {meetingOpps.slice(0, 8).map((o) => (
              <Card key={o.id}>
                <div className="text-sm font-medium text-slate-800">
                  {customerMap[o.customer_id]?.name || "客户"}
                  <span className="ml-2 text-xs text-emerald-700">
                    {OPP_TYPE[o.type] || o.type}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{o.title}</div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* 未成交原因 / 错失机会 */}
      <Card>
        <div className="mb-2 text-sm font-semibold text-slate-700">
          未成交原因 / 错失机会
        </div>
        {unclosed.length === 0 ? (
          <p className="text-sm text-slate-400">暂无相关沉淀。</p>
        ) : (
          <div className="space-y-2">
            {unclosed.slice(0, 6).map((a) => (
              <div key={a.id} className="border-b border-slate-50 pb-2 last:border-0">
                <div className="text-xs text-slate-500">
                  {a._customer?.name || "客户"} ·{" "}
                  {SCENE_LABEL[a._scene] || ""}
                </div>
                {a.decision_barriers && (
                  <p className="mt-0.5 text-xs text-amber-700">
                    阻碍：{a.decision_barriers.slice(0, 100)}
                  </p>
                )}
                {a.missed_opportunities && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    错失：
                    {a.missed_opportunities.replace(/^·\s*/gm, "").slice(0, 100)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 最近会谈复盘 */}
      <section>
        <SectionHeader title="最近会谈复盘" />
        {filtered.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-400">
              还没有会谈复盘。员工在「会谈」里录制后会出现在这里。
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.slice(0, 15).map((a) => (
              <Link
                key={a.id}
                href={`/meeting/${a.meeting_id}`}
                className="block rounded-xl border border-slate-200/70 bg-white p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-800">
                    {a._customer?.name || "临时客户"}
                    <span className="ml-2 text-xs text-slate-400">
                      {SCENE_LABEL[a._scene] || ""}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {empMap[a._employeeId]?.name || "未知员工"}
                  </span>
                </div>
                {a.summary && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                    {a.summary}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
