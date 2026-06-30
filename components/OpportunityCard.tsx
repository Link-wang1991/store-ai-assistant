import Link from "next/link";
import { Card } from "@/components/ui";
import { ActionButton } from "@/components/ActionButton";
import { completeOpportunity, deleteOpportunityRecord } from "@/lib/actions";
import { oppMeta, STAGE_LABEL, isOverdue } from "@/lib/opportunity";
import { fmtTime } from "@/lib/format";

// 一张「可执行的成交/复购卡」：客户是谁、当前状态、为什么值得跟、
// 阻碍、建议怎么开口、下一步目标、（可选）建议谁跟进。
export function OpportunityCard({ o, showAssignee = false, showDelete = false }: { o: any; showAssignee?: boolean; showDelete?: boolean }) {
  const t = oppMeta(o.type);
  const name = o.customer_records?.name || "未关联客户";
  const stage = o.customer_records?.stage ? STAGE_LABEL[o.customer_records.stage] : "";
  const overdue = isOverdue(o);

  const askQ = `针对「${name}」的「${o.title}」，${o.blocker ? `当前阻碍：${o.blocker}。` : ""}帮我判断怎么推进、用什么话术，下一步目标是${o.goal || "推进成交/复购"}`;

  return (
    <Card className={overdue ? "border-red-200" : undefined}>
      {/* 客户是谁 + 当前状态 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${t.cls}`}>{t.label}</span>
          <span className="text-sm font-semibold text-slate-900">{name}</span>
          {stage && <span className="text-[11px] text-slate-400">{stage}</span>}
          {o.source === "ai_extract" && <span className="text-[10px] text-slate-300">🤖AI</span>}
        </div>
        <span className={`shrink-0 text-[11px] ${overdue ? "font-medium text-red-500" : "text-slate-400"}`}>
          {o.due_at ? (overdue ? "已逾期" : `${fmtTime(o.due_at)} 前`) : ""}
        </span>
      </div>

      {/* 标题：要做什么 */}
      <div className="mt-1.5 text-sm font-medium text-slate-800">{o.title}</div>

      {/* 7 要素明细 */}
      <div className="mt-1.5 space-y-1 text-xs">
        {o.reason && (
          <p className="text-slate-600"><span className="text-slate-400">为什么值得跟：</span>{o.reason}</p>
        )}
        {o.blocker && (
          <p className="text-amber-700"><span className="text-amber-500/80">当前阻碍：</span>{o.blocker}</p>
        )}
        {o.opening && (
          <p className="rounded-lg bg-brand/5 px-2 py-1.5 text-brand-dark">
            <span className="text-brand-dark/60">建议这样开口：</span>{o.opening}
          </p>
        )}
        {o.goal && (
          <p className="text-slate-600"><span className="text-slate-400">下一步目标：</span>{o.goal}</p>
        )}
        {showAssignee && o.employees?.name && (
          <p className="text-slate-500"><span className="text-slate-400">建议跟进人：</span>{o.employees.name}</p>
        )}
      </div>

      {/* 动作 */}
      <div className="mt-2 flex items-center justify-end gap-3 border-t border-slate-50 pt-2">
        {o.customer_id && (
          <Link
            href={`/chat?customerId=${o.customer_id}&q=${encodeURIComponent(askQ)}`}
            className="rounded-lg bg-[var(--green-soft)] px-3 py-1 text-xs font-medium text-[var(--green-dark)]"
          >
            问 AI 怎么跟
          </Link>
        )}
        <ActionButton action={completeOpportunity.bind(null, o.id, "done")} label="完成" className="text-xs text-emerald-600" />
        <ActionButton action={completeOpportunity.bind(null, o.id, "dismissed")} label="忽略" className="text-xs text-slate-400" />
        {showDelete && (
          <ActionButton action={deleteOpportunityRecord.bind(null, o.id)} label="删除" confirmText="删除这条增长机会？" className="text-xs text-red-400" />
        )}
      </div>
    </Card>
  );
}
