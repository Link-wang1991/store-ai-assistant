"use client";

import { useEffect, useRef, useState } from "react";
import { setToken } from "@/lib/api-client";

export type LocalPreviewAccount = {
  employeeId: string;
  name: string;
  role: string;
  roleLabel: string;
  entry: string;
};

type Props = {
  initialPreviewAccounts: LocalPreviewAccount[];
};

/**
 * 登录交互层。免密角色名单由 Server Component 预先渲染，避免移动浏览器
 * 恢复旧页面或脚本尚未执行时把入口错误地隐藏起来。
 *
 * 两种登录方式：
 *  1) 密码登录 —— 手机号或邮箱 + 密码
 *  2) 验证码登录 —— 手机号 + 短信验证码（手机号须由超级管理员预录入）
 */
export function LoginClient({ initialPreviewAccounts }: Props) {
  const [mode, setMode] = useState<"password" | "code">("password");

  // 密码登录
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");

  // 验证码登录
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [devCodeHint, setDevCodeHint] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewAccounts, setPreviewAccounts] = useState<LocalPreviewAccount[]>(initialPreviewAccounts);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/local-preview-accounts", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => {
        if (active && result.code === 200 && Array.isArray(result.data)) setPreviewAccounts(result.data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startCountdown() {
    setCountdown(60);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  async function onSendCode() {
    setError(null);
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) {
      setError("请输入正确的手机号");
      return;
    }
    try {
      const res = await fetch("/api/backend/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), type: "login" }),
      });
      const result = await res.json();
      if (result.code !== 200) {
        setError(result.message || "验证码发送失败");
        return;
      }
      startCountdown();
      // 开发期 mock 模式会在响应里回传验证码，方便联调；生产环境不会有此字段
      if (result.data?.devCode) setDevCodeHint(result.data.devCode);
      else setDevCodeHint(null);
    } catch {
      setError("网络不稳定，验证码发送失败，请重试");
    }
  }

  async function finishLogin(token: string, redirectPath: string) {
    setToken(token);
    sessionStorage.removeItem("store_ai_local_preview");
    window.location.href = redirectPath;
  }

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const value = account.trim();
      const isPhone = /^1[3-9]\d{9}$/.test(value);
      const body = isPhone
        ? { phone: value, password }
        : { email: value.toLowerCase(), password };
      const res = await fetch("/api/backend/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (result.code !== 200 || !result.data?.token) {
        setError("登录失败：" + (result.message || "账号或密码错误"));
        return;
      }
      await finishLogin(result.data.token, "/");
    } catch {
      setError("网络不稳定，登录没有完成。请再点一次登录。");
    } finally {
      setLoading(false);
    }
  }

  async function onCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/backend/api/auth/login-by-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), code: code.trim() }),
      });
      const result = await res.json();
      if (result.code !== 200 || !result.data?.token) {
        setError("登录失败：" + (result.message || "验证码不正确"));
        return;
      }
      await finishLogin(result.data.token, "/");
    } catch {
      setError("网络不稳定，登录没有完成。请再点一次登录。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell flex min-h-screen flex-col justify-center px-6">
      <div className="auth-panel">
        <div className="mb-8 text-center">
          <h1 className="auth-title">欢迎回来</h1>
          <p className="auth-subtitle">员工工作指导 · 老板经营管理</p>
        </div>

        {/* 登录方式切换 */}
        <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-[#f1f6f2] p-1">
          <button
            type="button"
            onClick={() => { setMode("password"); setError(null); }}
            className={`rounded-lg py-2 text-[13px] font-semibold transition ${mode === "password" ? "bg-white text-[#006d37] shadow-sm" : "text-[#6c7b6d]"}`}
          >
            密码登录
          </button>
          <button
            type="button"
            onClick={() => { setMode("code"); setError(null); }}
            className={`rounded-lg py-2 text-[13px] font-semibold transition ${mode === "code" ? "bg-white text-[#006d37] shadow-sm" : "text-[#6c7b6d]"}`}
          >
            验证码登录
          </button>
        </div>

        {mode === "password" ? (
          <form onSubmit={onPasswordSubmit} className="space-y-4">
            <div>
              <label className="auth-label">手机号 / 邮箱</label>
              <input
                type="text"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="请输入手机号或邮箱"
                className="auth-input"
                required
              />
            </div>
            <div>
              <label className="auth-label">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                className="auth-input"
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="app-primary-button w-full py-3 text-sm disabled:opacity-60"
            >
              {loading ? "登录中…" : "登录"}
            </button>
          </form>
        ) : (
          <form onSubmit={onCodeSubmit} className="space-y-4">
            <div>
              <label className="auth-label">手机号</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="请输入手机号"
                className="auth-input"
                required
              />
            </div>
            <div>
              <label className="auth-label">验证码</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="请输入验证码"
                  className="auth-input flex-1"
                  required
                />
                <button
                  type="button"
                  onClick={onSendCode}
                  disabled={countdown > 0}
                  className="shrink-0 rounded-lg border border-[#cfe0d1] bg-white px-3 text-[12px] font-semibold text-[#006d37] disabled:opacity-50"
                >
                  {countdown > 0 ? `${countdown}s 后重发` : "获取验证码"}
                </button>
              </div>
              {devCodeHint && (
                <p className="mt-1 text-[11px] text-[#9aa79c]">开发模式验证码：{devCodeHint}</p>
              )}
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="app-primary-button w-full py-3 text-sm disabled:opacity-60"
            >
              {loading ? "登录中…" : "登录"}
            </button>
            <p className="text-center text-[11px] text-[#9aa79c]">手机号须由超级管理员预录入，未开通请先联系门店</p>
          </form>
        )}

        {previewAccounts.length > 0 && (
          <section className="mt-6 border-t border-[#dce8de] pt-5">
            <div className="rounded-xl border border-[#cfe0d1] bg-[#f3faf4] p-3">
              <h2 className="text-[13px] font-bold text-[#1d3321]">本机免密体验</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-[#58705d]">仅当前电脑启动的局域网版本可用；不修改账号密码，体验会话 4 小时后自动失效，签发会留下审计记录。</p>
              <div className="mt-3 grid gap-2">
                {previewAccounts.map((account) => (
                  <a
                    key={account.employeeId}
                    href={`/login/preview?employeeId=${encodeURIComponent(account.employeeId)}`}
                    className="flex items-center justify-between rounded-lg border border-[#d7e5d8] bg-white px-3 py-2.5 text-left"
                  >
                    <span><span className="block text-[13px] font-semibold text-[#243128]">{account.name}</span><span className="mt-0.5 block text-[11px] text-[#738077]">{account.roleLabel} · 查看该角色实际权限</span></span>
                    <span className="text-[11px] font-bold text-[#006d37]">免密进入</span>
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
