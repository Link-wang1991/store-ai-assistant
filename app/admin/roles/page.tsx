import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import {
  ROLES,
  ROLE_LABELS,
  PERMISSION_MODULES,
  PERMISSION_ACTIONS,
  DATA_SCOPES,
  type Role,
} from "@/lib/constants";
import { createRoleDefinition, saveRoleDefinition, saveRolePermissions } from "@/lib/actions";
import { ActionForm } from "@/components/ActionForm";
import { Card } from "@/components/ui";
import { AdminBackHeader } from "@/components/AdminBackHeader";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  view: "查看",
  create: "新建",
  edit: "编辑",
  delete: "删除",
  assign: "分配",
  review: "审核",
  export: "导出",
  handle_risk: "处理风险",
};

export default async function RolesPage() {
  const ctx = (await getAuthContext())!;
  if (!hasPermission(ctx, "permissions", "view")) redirect("/admin");
  const storeId = ctx.store.id;
  const [defs, perms] = await Promise.all([
    db.roles.listDefinitions(storeId),
    db.roles.listPermissions(storeId),
  ]);

  const permMap: Record<string, Record<string, any>> = {};
  for (const p of perms as any[]) {
    permMap[p.role_key] = permMap[p.role_key] || {};
    permMap[p.role_key][p.module] = p;
  }

  const inputCls =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <div>
      <AdminBackHeader title="权限中心" subtitle="自定义角色名称、状态、数据权限" />
      <div className="space-y-4 p-4">
        {(defs as any[]).length === 0 && (
          <Card>
            <p className="text-sm text-amber-600">
              还没有角色定义。请先执行 supabase/migration-v2.sql，并运行 seed 初始化默认角色，或在下方新增。
            </p>
          </Card>
        )}

        {/* 新增自定义角色 */}
        <Card>
          <div className="mb-2 text-sm font-semibold text-slate-700">新增自定义角色</div>
          <ActionForm action={createRoleDefinition} submitText="新增角色" resetOnSuccess className="space-y-2">
            <input name="role_key" placeholder="角色标识(英文，如 skin_manager)" className={inputCls} required />
            <input name="display_name" placeholder="显示名称(如 皮肤管理师)" className={inputCls} required />
            <select name="base_role" className={inputCls} defaultValue="consultant">
              {ROLES.map((r) => (
                <option key={r} value={r}>基于模板：{ROLE_LABELS[r]}</option>
              ))}
            </select>
            <input name="description" placeholder="说明(选填)" className={inputCls} />
          </ActionForm>
        </Card>

        {/* 角色列表 + 权限矩阵 */}
        {(defs as any[]).map((d) => (
          <Card key={d.id}>
            <ActionForm action={saveRoleDefinition} submitText="保存名称/状态" className="space-y-2">
              <input type="hidden" name="id" value={d.id} />
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                  {d.role_key}
                </span>
                <input name="display_name" defaultValue={d.display_name} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select name="status" className={inputCls} defaultValue={d.status}>
                  <option value="active">启用</option>
                  <option value="disabled">停用</option>
                </select>
                <input name="sort_order" type="number" defaultValue={d.sort_order} className={inputCls} />
              </div>
            </ActionForm>

            <details className="mt-3 border-t border-slate-50 pt-3">
              <summary className="cursor-pointer text-xs text-brand-dark">配置「{d.display_name}」权限矩阵</summary>
              <ActionForm action={saveRolePermissions} submitText="保存权限" className="mt-2 space-y-3">
                <input type="hidden" name="role_key" value={d.role_key} />
                {PERMISSION_MODULES.map((m) => {
                  const cur = permMap[d.role_key]?.[m.key];
                  return (
                    <div key={m.key} className="rounded-lg bg-slate-50 p-2">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-700">{m.label}</span>
                        <select
                          name={`scope_${m.key}`}
                          defaultValue={cur?.data_scope || "self"}
                          className="rounded border border-slate-200 px-2 py-1 text-[11px]"
                        >
                          {DATA_SCOPES.map((s) => (
                            <option key={s.key} value={s.key}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {PERMISSION_ACTIONS.map((a) => (
                          <label key={a} className="flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600">
                            <input
                              type="checkbox"
                              name={`act_${m.key}`}
                              value={a}
                              defaultChecked={cur?.actions?.includes(a)}
                            />
                            {ACTION_LABEL[a]}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </ActionForm>
            </details>
          </Card>
        ))}
      </div>
    </div>
  );
}
