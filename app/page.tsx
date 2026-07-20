"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Brand } from "@/components/Brand";

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="2">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    ),
    title: "AI 会谈复盘",
    desc: "录音转写、角色识别、需求提炼、问题分析、改进建议",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    title: "AI 客户画像",
    desc: "自动生成客户标签、消费阶段、风险判断与跟进建议",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M16.2 7.8l-4.6 4.6-2.8-2.8" />
      </svg>
    ),
    title: "AI 销售教练",
    desc: "围绕异议处理、成交话术、回访策略，直接给出可执行建议",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="2">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      </svg>
    ),
    title: "AI 知识库 + 长记忆",
    desc: "沉淀门店话术、项目知识、活动规则与成交经验，越用越懂门店",
  },
];

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // 优先 localStorage，其次 cookie（cookie 已由服务端 /api/login 写入）
    let token = localStorage.getItem("store_ai_token");
    if (!token && typeof document !== "undefined") {
      const m = document.cookie.match(/(?:^|;\s*)store_ai_token=([^;]*)/);
      if (m) token = m[1];
    }
    if (!token) {
      setChecking(false);
      return;
    }
    try {
      router.replace("/home");
    } catch {
      router.replace("/home");
    }
  }, [router]);

  if (checking) {
    return <div className="welcome-loading">加载中…</div>;
  }

  return (
    <main className="welcome-page">
      <div className="welcome-content">
        {/* 顶部身份标 */}
        <div className="welcome-brand"><Brand title="门店 AI 经营助手" /></div>
        <div className="welcome-eyebrow">专为美业门店打造的 AI 经营助手</div>

        {/* 主标题 */}
        <h1 className="welcome-title">
          不是管理系统，
          <br />
          而是帮门店增长的
          <br />
          <span>AI 经营大脑。</span>
        </h1>

        {/* 副标题 */}
        <p className="welcome-intro">
          聚焦门店最核心的经营问题：客户成交、重点跟进、会谈复盘、销售辅导与知识沉淀。让老板看清重点，让员工立刻知道今天该做什么。
        </p>

        {/* 功能卡片 */}
        <div className="welcome-feature-list">
          {FEATURES.map((f, idx) => (
            <div
              key={f.title}
              className="welcome-feature"
              style={{ animationDelay: `${idx * 80}ms` }}
            >
              <div className="welcome-feature-icon">
                {f.icon}
              </div>
              <div>
                <div className="welcome-feature-title">{f.title}</div>
                <div className="welcome-feature-description">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 核心价值 */}
        <div className="welcome-value">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span>核心价值：帮助门店提升成交效率、服务体验与复购增长。</span>
        </div>

        {/* CTA */}
        <div className="welcome-actions">
          <Link
            href="/login"
            className="app-primary-button flex h-12 w-full text-sm"
          >
            进入工作台
          </Link>
          <p className="welcome-footnote">
            已登录员工可直接从登录页进入 · 演示账号请联系管理员
          </p>
        </div>
      </div>
    </main>
  );
}
