import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { submitQuestion } from "@/lib/actions";
import { ActionForm } from "@/components/ActionForm";
import { canEnterAdmin } from "@/lib/permissions";
import { BottomNav, MAIN_NAV, STAFF_NAV } from "@/components/BottomNav";
import { SubpageHeader } from "@/components/SubpageHeader";

export const dynamic = "force-dynamic";

export default async function SubmitPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  return (
    <div className="subpage-shell">
      <SubpageHeader title="提交问题" description="需要负责人确认的情况可在这里提交" />
      <main className="subpage-content">
        <section className="subpage-card p-4">
        <p className="mb-4 text-sm leading-relaxed text-[var(--muted)]">
          遇到 AI 无法确定的问题（如特殊价格、客户承诺、活动叠加等），可以提交给老板或店长确认。
        </p>
        <ActionForm action={submitQuestion} submitText="提交" resetOnSuccess>
          <textarea
            name="question"
            rows={5}
            placeholder="描述你遇到的问题…"
            className="app-textarea"
            required
          />
        </ActionForm>
        </section>
      </main>
      <BottomNav items={canEnterAdmin(ctx) ? MAIN_NAV : STAFF_NAV} activeHref="/me" />
    </div>
  );
}
