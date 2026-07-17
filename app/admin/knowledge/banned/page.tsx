import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_BANNED_WORDS } from "@/lib/constants";
import { addBannedWord, removeBannedWord } from "@/lib/actions";
import { ActionForm } from "@/components/ActionForm";
import { ActionButton } from "@/components/ActionButton";
import { KnowledgeTabs } from "@/components/KnowledgeTabs";
import { Card } from "@/components/ui";
import { AdminBackHeader } from "@/components/AdminBackHeader";

export const dynamic = "force-dynamic";

export default async function BannedPage() {
  const ctx = (await getAuthContext())!;
  const words = await db.banned.listByStore(ctx.store.id);

  const inputCls =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <div>
      <AdminBackHeader title="禁用词管理" subtitle="生成话术/文案时自动提醒规避" />
      <KnowledgeTabs />
      <div className="space-y-3 p-4">
        <Card>
          <div className="mb-2 text-sm font-semibold text-slate-700">添加禁用词</div>
          <ActionForm action={addBannedWord} submitText="添加" resetOnSuccess className="space-y-2">
            <input name="word" placeholder="如：根治" className={inputCls} required />
            <input name="reason" placeholder="原因（选填）" className={inputCls} />
          </ActionForm>
        </Card>

        <Card>
          <div className="mb-2 text-sm font-semibold text-slate-700">系统内置禁用词</div>
          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_BANNED_WORDS.map((w) => (
              <span key={w} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">
                {w}
              </span>
            ))}
          </div>
        </Card>

        <Card>
          <div className="mb-2 text-sm font-semibold text-slate-700">
            门店自定义禁用词（{words?.length || 0}）
          </div>
          {(words || []).length === 0 ? (
            <p className="text-sm text-slate-400">还没有自定义禁用词</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(words || []).map((w: any) => (
                <span
                  key={w.id}
                  className="flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs text-red-600"
                >
                  {w.word}
                  <ActionButton
                    action={removeBannedWord.bind(null, w.id)}
                    label="×"
                    className="text-red-400"
                  />
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
