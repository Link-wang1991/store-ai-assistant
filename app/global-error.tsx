"use client";

import { useEffect } from "react";

/** 根布局异常的最后兜底，确保移动端不会只看到空白或转圈。 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("门店助手根页面异常", error); }, [error]);
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif", background: "#f4fbf5", color: "#1d2a20" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
          <section style={{ maxWidth: 360, background: "#fff", border: "1px solid #d9e7dc", borderRadius: 24, padding: 24 }}>
            <h1 style={{ fontSize: 20, margin: 0 }}>门店助手暂时不可用</h1>
            <p style={{ lineHeight: 1.6, color: "#627168" }}>请重试一次。若问题持续，请确认电脑上的门店助手服务仍在运行。</p>
            <button onClick={reset} style={{ border: 0, borderRadius: 999, background: "#078a4c", color: "#fff", padding: "10px 20px", fontWeight: 600 }}>重新加载</button>
          </section>
        </main>
      </body>
    </html>
  );
}
