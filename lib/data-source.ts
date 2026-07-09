// ============================================================
// 数据源配置 — 仅后端模式
// ============================================================

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

export function isSupabaseMode(): false { return false; }

export function isBackendMode(): true { return true; }
