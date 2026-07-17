import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { redirect } from "next/navigation";
import { KNOWLEDGE_CATEGORIES, ROLES } from "@/lib/constants";
import { hasPermission } from "@/lib/permissions";
import { roleLabel } from "@/lib/roles";
import { db } from "@/lib/db";
import { uploadKnowledge, createManualKnowledge } from "@/lib/actions";
import { ActionForm } from "@/components/ActionForm";
import { KnowledgeTabs } from "@/components/KnowledgeTabs";
import { BatchUploadWizard } from "@/components/BatchUploadWizard";
import { Card } from "@/components/ui";
import { AdminBackHeader } from "@/components/AdminBackHeader";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const ctx = (await getAuthContext())!;
  if (!hasPermission(ctx, "knowledge", "create")) redirect("/admin/knowledge");
  const roleDefs = await db.roles.listActiveDefinitions(ctx.store.id);
  const roleOptions =
    roleDefs.length > 0
      ? roleDefs.map((r: any) => ({ key: r.role_key, name: r.display_name }))
      : ROLES.map((r) => ({ key: r, name: roleLabel(r, ctx.roleLabels) }));

  // C4：知识库分类与「自定义配置」打通——门店自定义了知识库分类就用门店的，否则用默认
  const cfg = (await db.config.listByStore(ctx.store.id).catch(() => [])) as any[];
  const kbCats = cfg.filter((r) => r.category === "knowledge" && r.enabled).map((r) => r.display_name);
  // 并入已有资料用到的分类——AI 自动新建/手动指定的新分类下次上传也能在候选里看到
  const docs = (await db.knowledge.listDocs(ctx.store.id).catch(() => [])) as any[];
  const usedCats = Array.from(new Set(docs.map((d) => d.category).filter(Boolean)));
  const baseCats = kbCats.length > 0 ? kbCats : [...KNOWLEDGE_CATEGORIES];
  const categories: string[] = Array.from(new Set([...baseCats, ...usedCats]));

  const inputCls =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <div>
      <AdminBackHeader title="上传资料" subtitle="支持 md/txt/docx/pdf/Excel/CSV/PPT/图片，或直接手动输入" />
      <KnowledgeTabs />
      <div className="p-4">
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
          这里只传<b>话术 / SOP / 制度 / 活动方案</b>等资料。<b>客户名单</b>请去{" "}
          <Link href="/customers/import" className="font-medium underline">客户批量导入</Link>
          ，传到知识库不会进客户跟进系统。
        </div>
        {/* 批量上传：选多个文件，AI 自动判分类，上传后弹窗确认/微调 */}
        <Card>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            批量上传（AI 自动分类）
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-normal text-brand-dark">推荐</span>
          </div>
          <p className="mb-3 text-xs text-slate-400">
            一次选多个文件，系统自动解析并判分类，上传后弹窗让你确认，不准的当场改。
          </p>
          <BatchUploadWizard roleOptions={roleOptions} categories={categories} />
        </Card>

        <div className="my-4 flex items-center gap-2 text-[11px] text-slate-300">
          <div className="h-px flex-1 bg-slate-100" />单个精细上传<div className="h-px flex-1 bg-slate-100" />
        </div>

        <Card>
          <ActionForm action={uploadKnowledge} submitText="上传并解析" resetOnSuccess className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">资料标题 *</label>
              <input name="title" placeholder="如：6月补水修复活动" className={inputCls} required />
            </div>

            <div>
              <label className="mb-1 flex items-center justify-between text-xs text-slate-500">
                <span>资料分类 *（可选已有，也可直接输入新分类）</span>
                <Link href="/settings/config#knowledge" className="shrink-0 text-[var(--green-dark)]">管理分类 ›</Link>
              </label>
              <input
                name="category"
                list="kb-categories"
                className={inputCls}
                placeholder="如：项目介绍 / 价格表 / 客诉SOP（可自定义）"
                required
              />
              <datalist id="kb-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-500">可见角色 *（员工提问时只能检索可见资料）</label>
              <div className="grid grid-cols-3 gap-2">
                {roleOptions.map((r) => (
                  <label key={r.key} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                    <input
                      type="checkbox"
                      name="visible_roles"
                      value={r.key}
                      defaultChecked={true}
                    />
                    {r.name}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-500">标签（用逗号分隔，选填）</label>
              <input name="tags" placeholder="补水、夏季活动、新客" className={inputCls} />
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-500">上传文件 *（图片会自动识别文字，最大 25MB）</label>
              <input
                name="file"
                type="file"
                accept=".md,.txt,.docx,.pdf,.xlsx,.xls,.csv,.pptx,.jpg,.jpeg,.png,.webp"
                className="w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:text-white"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-500">是否启用</label>
              <select name="status" className={inputCls} defaultValue="active">
                <option value="active">启用（员工可检索）</option>
                <option value="disabled">暂存草稿（不可检索）</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-500">备注说明（选填）</label>
              <textarea name="remark" rows={2} placeholder="如：本活动不与会员卡叠加" className={inputCls} />
            </div>
          </ActionForm>
        </Card>

        {/* 手动输入知识（不传文件）*/}
        <Card className="mt-4">
          <div className="mb-2 text-sm font-semibold text-slate-700">或手动输入知识（不用传文件）</div>
          <ActionForm action={createManualKnowledge} submitText="创建知识" resetOnSuccess className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">标题 *</label>
              <input name="title" placeholder="如：会员卡退卡规则" className={inputCls} required />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">分类 *（可输入新分类）</label>
              <input name="category" list="kb-categories" className={inputCls} placeholder="如：制度规则 / 话术 / 客诉SOP" required />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">可见角色 *</label>
              <div className="grid grid-cols-3 gap-2">
                {roleOptions.map((r) => (
                  <label key={r.key} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                    <input type="checkbox" name="visible_roles" value={r.key} defaultChecked={true} />
                    {r.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">内容 *</label>
              <textarea name="content" rows={6} placeholder="直接把这条知识的内容打在这里，可以分段写。系统会自动切分并向量化。" className={inputCls} required />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">标签（逗号分隔，选填）</label>
              <input name="tags" placeholder="退卡、制度、会员" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">是否启用</label>
              <select name="status" className={inputCls} defaultValue="active">
                <option value="active">启用（员工可检索）</option>
                <option value="disabled">暂存草稿（不可检索）</option>
              </select>
            </div>
          </ActionForm>
        </Card>

        <p className="mt-3 text-center text-xs text-slate-400">
          上传/创建后系统会自动提取文本、按标题/段落切分为知识片段，并生成语义向量
        </p>
      </div>
    </div>
  );
}
