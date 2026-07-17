import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { KNOWLEDGE_CATEGORIES } from "@/lib/constants";
import { createStandardAnswer } from "@/lib/actions";
import { ActionForm } from "@/components/ActionForm";
import { KnowledgeTabs } from "@/components/KnowledgeTabs";
import { Card, EmptyState } from "@/components/ui";
import { AdminBackHeader } from "@/components/AdminBackHeader";

export const dynamic = "force-dynamic";

export default async function StandardPage() {
  const ctx = (await getAuthContext())!;
  const list = await db.standard.listActive(ctx.store.id);

  const inputCls =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <div>
      <AdminBackHeader title="标准答案" subtitle="老板/店长沉淀的门店标准回答" />
      <KnowledgeTabs />
      <div className="space-y-3 p-4">
        <Card>
          <div className="mb-2 text-sm font-semibold text-slate-700">新增标准答案</div>
          <ActionForm action={createStandardAnswer} submitText="保存" resetOnSuccess className="space-y-2">
            <input name="question" placeholder="问题，如：客户嫌贵怎么回？" className={inputCls} required />
            <textarea name="answer" rows={3} placeholder="标准答案…" className={inputCls} required />
            <select name="category" className={inputCls} defaultValue="">
              <option value="">分类（选填）</option>
              {KNOWLEDGE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </ActionForm>
        </Card>

        {(list || []).length === 0 ? (
          <EmptyState text="还没有标准答案" />
        ) : (
          (list || []).map((s: any) => (
            <Card key={s.id}>
              <div className="text-sm font-medium text-slate-900">Q：{s.question}</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-slate-600">A：{s.answer}</div>
              {s.category && (
                <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                  {s.category}
                </span>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
