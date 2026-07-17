import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLES } from "@/lib/constants";
import { roleLabel } from "@/lib/roles";
import { hasPermission } from "@/lib/permissions";
import { createEmployee, toggleEmployee } from "@/lib/actions";
import { ActionForm } from "@/components/ActionForm";
import { ActionButton } from "@/components/ActionButton";
import { EmployeeNameEdit } from "@/components/EmployeeNameEdit";
import { EmployeeRoleEdit, CustomerTransfer } from "@/components/EmployeeAdmin";
import { Card } from "@/components/ui";
import { AdminBackHeader } from "@/components/AdminBackHeader";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const ctx = (await getAuthContext())!;
  if (!hasPermission(ctx, "employees", "view")) redirect("/admin");
  const canCreate = hasPermission(ctx, "employees", "create");
  const labels = ctx.roleLabels;
  const [employees, defs] = await Promise.all([
    db.employees.listByStore(ctx.store.id),
    db.roles.listActiveDefinitions(ctx.store.id),
  ]);
  const roleOptions =
    (defs as any[]).length > 0
      ? (defs as any[]).map((d) => ({ key: d.role_key, name: d.display_name }))
      : ROLES.map((r) => ({ key: r, name: roleLabel(r, labels) }));
  const empList = ((employees as any[]) || []).map((e) => ({ id: e.id, name: e.name }));

  const inputCls =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <div>
      <AdminBackHeader title="员工管理" subtitle={`共 ${employees?.length || 0} 人`} />
      <div className="space-y-4 p-4">
        {/* 添加员工 */}
        {canCreate && (
        <Card>
          <div className="mb-2 text-sm font-semibold text-slate-700">添加员工</div>
          <ActionForm action={createEmployee} submitText="添加员工" resetOnSuccess className="space-y-2">
            <input name="name" placeholder="姓名" className={inputCls} required />
            <input name="email" type="email" placeholder="登录邮箱" className={inputCls} required />
            <input name="password" type="text" placeholder="初始密码（≥6位）" className={inputCls} required />
            <input name="phone" placeholder="手机号（选填）" className={inputCls} />
            <input name="position" placeholder="岗位/职位（选填）" className={inputCls} />
            <select name="role" className={inputCls} defaultValue={roleOptions[0]?.key}>
              {roleOptions.map((o) => (
                <option key={o.key} value={o.key}>{o.name}</option>
              ))}
            </select>
          </ActionForm>
        </Card>
        )}

        {/* 员工列表 */}
        <div className="space-y-2">
          {(employees || []).map((e: any) => (
            <div
              key={e.id}
              className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-white p-3.5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center text-sm font-medium text-slate-900">
                  <EmployeeNameEdit id={e.id} name={e.name} />
                  {e.role === "owner" ? (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                      {roleLabel(e.role, labels)}
                    </span>
                  ) : (
                    <EmployeeRoleEdit id={e.id} role={e.role} options={roleOptions} />
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {e.phone || "无手机号"}
                  {e.status === "disabled" && <span className="ml-2 text-red-400">已停用</span>}
                </div>
              </div>
              {e.role !== "owner" && (
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <CustomerTransfer fromId={e.id} employees={empList} />
                  <ActionButton
                    action={toggleEmployee.bind(null, e.id)}
                    label={e.status === "active" ? "停用" : "启用"}
                    confirmText={e.status === "active" ? `确定停用 ${e.name}？停用后无法登录` : undefined}
                    className={e.status === "active" ? "text-xs text-red-500" : "text-xs text-brand-dark"}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
