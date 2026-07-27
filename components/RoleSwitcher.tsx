"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { authApi, employeeAccountApi, getToken, setToken, type SwitchableAccount } from "@/lib/api-client";

type CurrentIdentity = {
  name: string;
  email: string;
  role: string;
  roleLabel: string;
};

type LocalPreviewAccount = {
  employeeId: string;
  name: string;
  role: string;
  roleLabel: string;
  entry: string;
};

function isManagementRole(role: string) {
  return ["owner", "manager", "admin"].includes(role);
}

function entryFor(role: string) {
  return isManagementRole(role) ? "/admin" : "/work";
}

/**
 * 角色不可由前端直接改写。此组件只协助用户选择一个真实账号，并通过常规登录
 * 换发 JWT；因此页面、导航和后端权限会同时按目标岗位生效。
 */
export function RoleSwitcher() {
  const [current, setCurrent] = useState<CurrentIdentity | null>(null);
  const [accounts, setAccounts] = useState<SwitchableAccount[]>([]);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewActive, setPreviewActive] = useState(false);
  const [localPreviewActive, setLocalPreviewActive] = useState(false);
  const [localPreviewAccounts, setLocalPreviewAccounts] = useState<LocalPreviewAccount[]>([]);
  const [localPreviewLoadingId, setLocalPreviewLoadingId] = useState<string | null>(null);

  async function refreshAccounts() {
    const listed = await employeeAccountApi.listSwitchable();
    if (listed.ok) setAccounts(listed.data || []);
  }

  async function refreshLocalPreviewAccounts() {
    try {
      const response = await fetch("/api/local-preview-accounts", { cache: "no-store" });
      const result = await response.json();
      if (response.ok && result.code === 200 && Array.isArray(result.data)) {
        setLocalPreviewAccounts(result.data);
        setLocalPreviewActive(true);
      } else {
        setLocalPreviewAccounts([]);
        setLocalPreviewActive(false);
      }
    } catch {
      // 本机体验接口不可用时，不影响普通账号切换。
      setLocalPreviewAccounts([]);
      setLocalPreviewActive(false);
    }
  }

  useEffect(() => {
    let alive = true;
    if (!getToken()) return;

    (async () => {
      setPreviewActive(sessionStorage.getItem("store_ai_employee_preview") === "1");
      setLocalPreviewActive(sessionStorage.getItem("store_ai_local_preview") === "1");
      // local profile 开启时，所有已登录角色都可以在“我的”页继续免密验收；
      // 在正式环境接口会拒绝，区块不会出现。
      void refreshLocalPreviewAccounts();
      const me = await authApi.me();
      if (!alive || !me.ok || !me.data) return;
      const identity = me.data;
      setCurrent({
        name: identity.name || identity.email,
        email: identity.email,
        role: identity.role,
        roleLabel: identity.roleLabel || identity.role,
      });
      setEmail(identity.email || "");

      if (isManagementRole(identity.role)) {
        const listed = await employeeAccountApi.listSwitchable();
        if (alive && listed.ok) setAccounts(listed.data || []);
      }
    })();

    return () => { alive = false; };
  }, []);

  const selected = useMemo(
    () => accounts.find((account) => account.email === email),
    [accounts, email]
  );

  async function signOutAndChooseAccount() {
    await fetch("/api/logout", { method: "POST" }).catch(() => undefined);
    setToken(null);
    sessionStorage.removeItem("store_ai_local_preview");
    sessionStorage.removeItem("store_ai_employee_preview");
    sessionStorage.removeItem("store_ai_preview_return_token");
    window.location.href = "/login?switch=1";
  }

  async function switchAccount(event: FormEvent) {
    event.preventDefault();
    if (!email || !password) {
      setError("请选择账号并输入该账号的密码");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();
      if (!response.ok || result.code !== 200 || !result.data?.token) {
        setError(result.message || "登录失败，请核对目标账号密码");
        return;
      }
      setToken(result.data.token);
      sessionStorage.removeItem("store_ai_local_preview");
      sessionStorage.removeItem("store_ai_employee_preview");
      sessionStorage.removeItem("store_ai_preview_return_token");
      const nextRole = String(result.data.role || selected?.role || "");
      window.location.href = selected?.entry || entryFor(nextRole);
    } catch {
      setError("切换没有完成，请确认后端服务正在运行后重试");
    } finally {
      setLoading(false);
    }
  }

  async function previewEmployee(account: SwitchableAccount) {
    if (current?.role !== "owner") return;
    const returnToken = getToken();
    if (!returnToken) {
      setError("老板登录已过期，请重新登录后再体验员工身份");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await employeeAccountApi.previewLogin(account.employeeId);
      if (!result.ok || !result.data?.token) {
        setError(result.error || "无法进入员工体验视图");
        return;
      }
      // 只在当前浏览器会话保存“返回老板身份”的令牌，不持久化到本机。
      sessionStorage.setItem("store_ai_preview_return_token", returnToken);
      sessionStorage.setItem("store_ai_employee_preview", "1");
      setToken(result.data.token);
      window.location.href = "/home";
    } catch {
      setError("员工身份体验没有完成，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  async function switchLocalPreview(account: LocalPreviewAccount) {
    setLocalPreviewLoadingId(account.employeeId);
    setError(null);
    try {
      const response = await fetch("/api/local-preview-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: account.employeeId }),
      });
      const result = await response.json();
      if (!response.ok || result.code !== 200 || !result.data?.token) {
        setError(result.message || "本机角色体验暂不可用");
        return;
      }
      setToken(result.data.token);
      sessionStorage.setItem("store_ai_local_preview", "1");
      sessionStorage.removeItem("store_ai_employee_preview");
      sessionStorage.removeItem("store_ai_preview_return_token");
      window.location.href = account.entry || "/home";
    } catch {
      setError("本机角色切换没有完成，请确认电脑上的服务仍在运行。");
    } finally {
      setLocalPreviewLoadingId(null);
    }
  }

  function returnToOwner() {
    const returnToken = sessionStorage.getItem("store_ai_preview_return_token");
    if (!returnToken) {
      void signOutAndChooseAccount();
      return;
    }
    setToken(returnToken);
    sessionStorage.removeItem("store_ai_employee_preview");
    sessionStorage.removeItem("store_ai_preview_return_token");
    window.location.href = "/admin";
  }

  if (!current) return null;

  const canChooseKnownAccount = isManagementRole(current.role) && accounts.length > 0;
  const previewCandidates = accounts.filter((account) => account.role !== "owner");

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
          setPassword("");
          if (isManagementRole(current.role)) void refreshAccounts();
          void refreshLocalPreviewAccounts();
        }}
        className="fixed bottom-28 right-4 z-40 rounded-full border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 shadow-lg shadow-emerald-950/10 transition hover:bg-emerald-50"
        aria-label="切换登录身份"
      >
        {previewActive ? `体验：${current.roleLabel}` : `身份：${current.roleLabel}`}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/30 px-4 pb-5 sm:items-center sm:pb-0">
          <section className="w-full max-w-[390px] rounded-2xl border border-emerald-100 bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-label="切换登录身份">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{previewActive ? "正在体验员工身份" : "切换登录身份"}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {previewActive
                    ? `当前正在查看 ${current.name} · ${current.roleLabel} 的真实员工页面与数据范围。`
                    : `当前为 ${current.name} · ${current.roleLabel}。切换会重新登录目标账号，页面和权限会同步变化。`}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-sm text-slate-400 hover:bg-slate-100" aria-label="关闭">关闭</button>
            </div>

            {previewActive ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  这是老板的临时体验视图：客户、任务、会谈和后台入口均按当前员工身份展示。完成查看后请返回老板身份。
                </div>
                <button type="button" onClick={returnToOwner} className="app-primary-button w-full py-2.5 text-sm">
                  返回老板身份
                </button>
              </div>
            ) : (
              <>
            {localPreviewActive && localPreviewAccounts.length > 0 && (
              <section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <h3 className="text-sm font-semibold text-emerald-900">本机免密角色切换</h3>
                <p className="mt-1 text-xs leading-5 text-emerald-800/80">仅当前电脑启动的局域网版本开放。切换后会按目标角色的真实数据权限重新加载，体验会话 4 小时后失效。</p>
                <div className="mt-2.5 grid gap-2">
                  {localPreviewAccounts.map((account) => (
                    <button
                      key={account.employeeId}
                      type="button"
                      disabled={loading || localPreviewLoadingId !== null}
                      onClick={() => void switchLocalPreview(account)}
                      className="flex items-center justify-between rounded-lg border border-emerald-200 bg-white px-3 py-2.5 text-left transition hover:border-emerald-400 disabled:opacity-60"
                    >
                      <span><span className="block text-sm font-medium text-slate-800">{account.name}</span><span className="block pt-0.5 text-xs text-slate-500">{account.roleLabel} · 实际权限</span></span>
                      <span className="text-xs font-semibold text-emerald-700">{localPreviewLoadingId === account.employeeId ? "进入中…" : "免密进入"}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {current.role === "owner" && previewCandidates.length > 0 && (
              <section className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                <h3 className="text-sm font-semibold text-emerald-900">体验员工身份</h3>
                <p className="mt-1 text-xs leading-5 text-emerald-800/80">仅老板可用，无需员工密码；进入后会以该员工的实际权限和数据范围展示。</p>
                <div className="mt-2.5 grid gap-2">
                  {previewCandidates.map((account) => (
                    <button
                      key={account.employeeId}
                      type="button"
                      disabled={loading}
                      onClick={() => void previewEmployee(account)}
                      className="flex items-center justify-between rounded-lg border border-emerald-200 bg-white px-3 py-2.5 text-left transition hover:border-emerald-400 disabled:opacity-60"
                    >
                      <span><span className="block text-sm font-medium text-slate-800">{account.name}</span><span className="block pt-0.5 text-xs text-slate-500">{account.roleLabel} · 员工视图</span></span>
                      <span className="text-xs font-semibold text-emerald-700">体验</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {canChooseKnownAccount ? (
              <form onSubmit={switchAccount} className="mt-4 space-y-3">
                <div className="text-xs font-semibold text-slate-600">真实账号切换</div>
                <label className="block text-xs font-medium text-slate-600">
                  选择本门店账号
                  <select
                    value={email}
                    onChange={(event) => { setEmail(event.target.value); setError(null); }}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500"
                  >
                    {accounts.map((account) => (
                      <option key={account.employeeId} value={account.email}>
                        {account.name} · {account.roleLabel}（{account.email}）
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  目标账号密码
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="请输入目标账号密码"
                    autoComplete="current-password"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                  />
                </label>
                {error && <p className="text-xs text-red-500">{error}</p>}
                <button type="submit" disabled={loading} className="app-primary-button w-full py-2.5 text-sm disabled:opacity-60">
                  {loading ? "切换中…" : `登录为${selected?.roleLabel || "该账号"}`}
                </button>
              </form>
            ) : !localPreviewActive ? (
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                该账号没有查看其他员工登录邮箱的权限。请先退出，再使用目标账号的邮箱和密码登录。
              </div>
            ) : null}
              </>
            )}

            <button type="button" onClick={signOutAndChooseAccount} className="mt-3 w-full rounded-xl py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
              前往登录页切换账号
            </button>
          </section>
        </div>
      )}
    </>
  );
}
