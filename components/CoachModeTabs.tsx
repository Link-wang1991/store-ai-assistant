import Link from "next/link";

export type CoachMode = "workbench" | "classic";

/** Keeps the newer coaching workbench and the original chat experience discoverable. */
export function CoachModeTabs({ active }: { active: CoachMode }) {
  return (
    <nav className="coach-mode-tabs" aria-label="AI 教练视图切换">
      <Link href="/chat" className={active === "workbench" ? "active" : ""} aria-current={active === "workbench" ? "page" : undefined}>
        教练工作台
      </Link>
      <Link href="/chat?view=classic" className={active === "classic" ? "active" : ""} aria-current={active === "classic" ? "page" : undefined}>
        经典对话
      </Link>
    </nav>
  );
}
