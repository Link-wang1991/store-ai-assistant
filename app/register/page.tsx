"use client";

import { useState } from "react";
import { authApi } from "@/lib/api-client";
import { Brand } from "@/components/Brand";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError("请输入姓名"); return; }
    if (!email.trim()) { setError("请输入邮箱"); return; }
    if (password.length < 6) { setError("密码至少 6 个字符"); return; }
    if (password !== confirmPassword) { setError("两次密码输入不一致"); return; }

    setLoading(true);
    try {
      const result = await authApi.register(email, password, name, storeName || name + "的门店");
      if (!result.ok) {
        setError(result.error || "注册失败");
        return;
      }
      setSuccess(true);
    } catch {
      setError("网络不稳定，注册没有完成。请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="auth-shell flex min-h-screen flex-col justify-center px-6">
        <div className="auth-panel text-center">
          <div className="auth-brand"><Brand title="门店 AI 经营助手" /></div>
          <div className="auth-success-mark" aria-hidden="true">✓</div>
          <h1 className="auth-title">注册成功</h1>
          <p className="auth-subtitle">你的门店已经创建好了，现在去登录吧。</p>
          <a
            href="/login"
            className="app-primary-button mt-6 inline-flex px-8 py-3 text-sm"
          >
            去登录
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell flex min-h-screen flex-col justify-center px-6">
      <div className="auth-panel">
      <div className="mb-8 text-center">
        <div className="auth-brand"><Brand title="门店 AI 经营助手" /></div>
        <h1 className="auth-title">创建门店账号</h1>
        <p className="auth-subtitle">注册后自动创建门店，你就是老板</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="auth-label">姓名</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="你的姓名"
            className="auth-input"
            required
          />
        </div>
        <div>
          <label className="auth-label">邮箱</label>
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
            placeholder="至少 6 位密码"
            className="auth-input"
            required
            minLength={6}
          />
        </div>
        <div>
          <label className="auth-label">确认密码</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="再次输入密码"
            className="auth-input"
            required
            minLength={6}
          />
        </div>
        <div>
          <label className="auth-label">门店名称（可选）</label>
          <input
            type="text"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="不填则默认为「你的姓名 + 的门店」"
            className="auth-input"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="app-primary-button w-full py-3 text-sm disabled:opacity-60"
        >
          {loading ? "注册中…" : "注册并创建门店"}
        </button>
      </form>

      <p className="auth-footer">
        已有账号？{" "}
        <a href="/login" className="font-medium text-[var(--green-dark)] hover:underline">
          去登录
        </a>
      </p>
      </div>
    </div>
  );
}
