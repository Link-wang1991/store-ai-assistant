"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type DemoAccount = {
  role: string;
  name: string;
  email: string;
  password: string;
  entry: string;
  purpose: string;
};

type StatusItem = {
  label: string;
  value: string;
  ok: boolean;
  hint?: string;
};

const STABLE_URL = "https://store-ai-assistant.vercel.app";

const mainLinks = [
  { label: "登录页", href: "/login", desc: "手动输入账号密码" },
  { label: "老板端首页", href: "/admin", desc: "今日待办、风险、提问记录" },
  { label: "员工对话", href: "/chat", desc: "手机端 AI 工作指导" },
  { label: "员工管理", href: "/admin/employees", desc: "角色、账号、状态" },
  { label: "知识库", href: "/admin/knowledge", desc: "资料、缺口、标准答案" },
  { label: "任务管理", href: "/admin/tasks", desc: "任务创建与跟进" },
  { label: "经营报告", href: "/admin/reports", desc: "日报、周报、管理建议" },
  { label: "我的任务", href: "/tasks", desc: "员工任务视角" },
];

export function StartClient({
  demoMode,
  accounts,
  status,
}: {
  demoMode: boolean;
  accounts: DemoAccount[];
  status: StatusItem[];
}) {
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [localUrl, setLocalUrl] = useState("http://localhost:3000");

  useEffect(() => {
    setLocalUrl(window.location.origin);
  }, []);

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-5">
        <div className="text-xs font-medium text-teal-600">本地测试入口</div>
        <h1 className="mt-1 text-xl font-bold text-slate-950">门店 AI 经营助手 · 启动中心</h1>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          当前地址：<span className="font-medium text-slate-700">{localUrl}</span>
        </p>
      </header>

      <div className="space-y-4 p-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-xs leading-5 text-teal-800">
            手机稳定入口：<a className="font-semibold underline" href={`${STABLE_URL}/login`}>{STABLE_URL}/login</a>
            <div className="text-teal-700/80">不要用 localhost 或局域网 IP 给手机测正式登录；线上 HTTPS 入口不依赖电脑当前 VPN/IP。</div>
          </div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">系统状态</h2>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600"
            >
              刷新
            </button>
          </div>
          <div className="space-y-2">
            {status.map((item) => (
              <div key={item.label} className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-slate-800">{item.label}</div>
                  {item.hint && <div className="mt-0.5 text-xs leading-5 text-slate-400">{item.hint}</div>}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    item.ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">主要入口</h2>
          <div className="grid grid-cols-2 gap-2">
            {mainLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg border border-slate-200 px-3 py-3 hover:border-teal-300 hover:bg-teal-50"
              >
                <div className="text-sm font-semibold text-slate-800">{link.label}</div>
                <div className="mt-1 text-xs leading-5 text-slate-400">{link.desc}</div>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">演示账号</h2>
              <p className="mt-1 text-xs text-slate-400">执行 seed 后可用，密码统一 demo123456。</p>
            </div>
            <span className="text-right text-[11px] leading-5 text-slate-400">文档/demo-accounts.md</span>
          </div>

          {!demoMode ? (
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
              Demo Mode 已关闭。设置 NEXT_PUBLIC_DEMO_MODE=true 后显示账号与快速登录。
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((account) => (
                <div key={account.email} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {account.role} · {account.name}
                      </div>
                      <div className="mt-1 truncate text-xs text-slate-500">{account.email}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-400">{account.purpose}</div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                      {account.entry}
                    </span>
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => copy(`${account.email}\n${account.password}`, account.email)}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600"
                    >
                      {copied === account.email ? "已复制" : "复制账号"}
                    </button>
                  </div>
                </div>
              ))}
              {loginError && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{loginError}</div>}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">下一步测试闭环</h2>
          <ol className="space-y-2 text-sm leading-6 text-slate-600">
            <li>1. 用咨询师登录，去员工对话问“客户嫌贵怎么回？”</li>
            <li>2. 再问“客户脸过敏红肿了怎么办？”验证风险升级</li>
            <li>3. 用老板登录，检查首页最近提问、风险问题、报告统计是否变化</li>
          </ol>
        </section>
      </div>
    </main>
  );
}
