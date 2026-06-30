import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { submitQuestion } from "@/lib/actions";
import { ActionForm } from "@/components/ActionForm";

export const dynamic = "force-dynamic";

export default async function SubmitPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3">
        <Link href="/me" className="text-slate-400">←</Link>
        <h1 className="text-base font-semibold text-slate-900">提交问题给老板/店长</h1>
      </header>
      <div className="p-4">
        <p className="mb-3 text-sm text-slate-500">
          遇到 AI 无法确定的问题（如特殊价格、客户承诺、活动叠加等），可以提交给老板或店长确认。
        </p>
        <ActionForm action={submitQuestion} submitText="提交" resetOnSuccess>
          <textarea
            name="question"
            rows={5}
            placeholder="描述你遇到的问题…"
            className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-brand"
            required
          />
        </ActionForm>
      </div>
    </div>
  );
}
