// ============================================================
// 数据源配置 — 仅后端模式
// ============================================================

/** Java 后端的真实地址：仅由 Next 服务端和同源代理使用。 */
export const BACKEND_API_BASE_URL =
  process.env.INTERNAL_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8080";

/**
 * 浏览器不可直接请求 localhost:8080：在手机上 localhost 指向手机自己，
 * 而不是启动软件的电脑。客户端一律经过当前网页同源代理；Server Component
 * 和 Route Handler 才直接访问本机 Java 服务。
 */
export const API_BASE_URL =
  typeof window === "undefined" ? BACKEND_API_BASE_URL : "/api/backend";

export function isSupabaseMode(): false { return false; }

export function isBackendMode(): true { return true; }
