import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { type Role } from "@/lib/constants";
import { roleLabel } from "@/lib/roles";
import { PageHeader, Card, RiskBadge, EmptyState } from "@/components/ui";
import { fmtTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ChatsPage() {
  const ctx = (await getAuthContext())!;
  const labels = ctx.roleLabels;
  const msgs = await db.chat.listRecentByStore(ctx.store.id, 60);

  return (
    <div>
      <PageHeader title="员工提问记录" subtitle={`最近 ${(msgs as any[]).length} 条`} />
      <div className="space-y-3 p-4">
        {(msgs as any[]).length === 0 ? (
          <EmptyState text="还没有员工提问记录" />
        ) : (
          (msgs as any[]).map((m) => (
            <Card key={m.id}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {m.employees?.name}（{roleLabel(m.employees?.role as Role, labels)}）· {fmtTime(m.created_at)}
                </span>
                {m.risk_level && m.risk_level !== "L1" && <RiskBadge level={m.risk_level} />}
              </div>
              <p className="mt-1.5 text-sm font-medium text-slate-800">{m.user_message}</p>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
