"use client";

import { useState } from "react";
import { authApi, setToken } from "@/lib/api-client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await authApi.login(email, password);
      if (!result.ok || !result.data) {
        setError("登录失败：" + (result.error || "请检查账号密码"));
        return;
      }
      setToken(result.data.token);
      window.location.href = "/home";
    } catch {
      setError("网络不稳定，登录没有完成。请再点一次登录。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-3xl">
          🏪
        </div>
        <h1 className="text-xl font-bold text-slate-900">门店 AI 经营助手</h1>
        <p className="mt-1 text-sm text-slate-400">员工工作指导 · 老板经营管理</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-slate-600">登录邮箱</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand"
            required
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? "登录中…" : "登录"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        还没有账号？{" "}
        <a href="/register" className="font-medium text-brand hover:underline">
          立即注册
        </a>
      </p>
    </div>
  );
}
