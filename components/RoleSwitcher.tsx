"use client";

import { useEffect, useState } from "react";
import { getCurrentEmail } from "@/lib/auth/client";
import { listDemoSwitchAccounts } from "@/lib/actions";

// 仅演示模式启用：登录后在任意页面一键切换角色，无需回登录页。
const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

type Account = { name: string; roleLabel: string; email: string; entry: string };

export function RoleSwitcher() {
  const [email, setEmail] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!DEMO) return;
    getCurrentEmail().then(setEmail);
    // 动态加载门店真实员工（改名/新增都会出现），不再用写死的假账号
    listDemoSwitchAccounts()
      .then((a) => { setAccounts(a); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  if (!DEMO) return null; // 非演示模式不显示；演示模式下即使本地 session 暂未读到也允许切换

  async function switchTo(a: Account) {
    if (a.email === email) {
      setOpen(false);
      return;
    }
    setBusy(a.email);
    window.location.href = `/api/demo-login?email=${encodeURIComponent(a.email)}&next=${encodeURIComponent(a.entry)}`;
  }

  const current = accounts.find((a) => a.email === email);

  return (
    <div className="fixed bottom-20 right-3 z-50 flex flex-col items-end">
      {open && (
        <div className="mb-2 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-3 py-2 text-[11px] text-slate-400">
            演示 · 登录 / 切换角色
          </div>
          {accounts.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-slate-400">{loaded ? "演示账号暂不可用，请手动输入账号密码" : "加载角色中…"}</div>
          ) : (
            accounts.map((a) => (
              <button
                key={a.email}
                onClick={() => switchTo(a)}
                disabled={!!busy}
                className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-xs ${
                  a.email === email ? "bg-brand/10 font-medium text-brand-dark" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>
                  {a.roleLabel} · {a.name}
                </span>
                {busy === a.email ? (
                  <span className="text-slate-400">…</span>
                ) : a.email === email ? (
                  <span className="text-[10px] text-brand-dark">当前</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-brand px-4 py-2.5 text-xs font-medium text-white shadow-lg"
      >
        🔀 {current ? current.roleLabel : "演示登录"}
      </button>
    </div>
  );
}
