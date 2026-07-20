"use client";

import { useState } from "react";
import { Brand } from "@/components/Brand";

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
      // cookie 已由服务端设置，localStorage 存一份给 getToken() 用
      localStorage.setItem("store_ai_token", result.data.token);
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
