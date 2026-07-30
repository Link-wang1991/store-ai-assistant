"use client";

import { useEffect, useState } from "react";
import { Brand } from "@/components/Brand";

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
 */
export function LoginClient({ initialPreviewAccounts }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewAccounts, setPreviewAccounts] = useState<LocalPreviewAccount[]>(initialPreviewAccounts);

  useEffect(() => {
    let active = true;
    fetch("/api/local-preview-accounts", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => {
        if (active && result.code === 200 && Array.isArray(result.data)) setPreviewAccounts(result.data);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await res.json();
      if (result.code !== 200 || !result.data?.token) {
        setError("登录失败：" + (result.message || "请检查账号密码"));
        return;
      }
      // cookie 已由服务端设置，localStorage 存一份给 getToken() 用。
      localStorage.setItem("store_ai_token", result.data.token);
      sessionStorage.removeItem("store_ai_local_preview");
      window.location.href = "/";
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
          <div className="auth-brand"><Brand title="门店 AI 经营助手" /></div>
          <h1 className="auth-title">欢迎回来</h1>
          <p className="auth-subtitle">员工工作指导 · 老板经营管理</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="auth-label">登录邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
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

        <p className="auth-footer">
          还没有账号？{" "}
          <a href="/register" className="font-medium text-[var(--green-dark)] hover:underline">
            立即注册
          </a>
        </p>
      </div>
    </div>
  );
}
