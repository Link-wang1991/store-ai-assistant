"use client";

import { useState } from "react";
import { authApi } from "@/lib/api-client";

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
      <div className="flex min-h-screen flex-col justify-center px-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100 text-3xl">
            ✅
          </div>
          <h1 className="text-xl font-bold text-slate-900">注册成功！</h1>
          <p className="mt-2 text-sm text-slate-500">你的门店已经创建好了，现在去登录吧。</p>
          <a
            href="/login"
            className="mt-6 inline-block rounded-xl bg-brand px-8 py-3 text-sm font-medium text-white"
          >
            去登录
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-3xl">
          🏪
        </div>
        <h1 className="text-xl font-bold text-slate-900">创建门店账号</h1>
        <p className="mt-1 text-sm text-slate-400">注册后自动创建门店，你就是老板</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-slate-600">姓名</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="你的姓名"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">邮箱</label>
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
            placeholder="至少 6 位密码"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand"
            required
            minLength={6}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">确认密码</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="再次输入密码"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand"
            required
            minLength={6}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">门店名称（可选）</label>
          <input
            type="text"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="不填则默认为「你的姓名 + 的门店」"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? "注册中…" : "注册并创建门店"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        已有账号？{" "}
        <a href="/login" className="font-medium text-brand hover:underline">
          去登录
        </a>
      </p>
    </div>
  );
}
