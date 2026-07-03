// ============================================================
// 数据源配置
// supabase: 前端直连 Supabase（不依赖 Spring Boot 后端，省钱）
// backend:  走 Spring Boot 后端代理
// ============================================================

export type DataSource = "supabase" | "backend";

export const DATA_SOURCE: DataSource =
  (process.env.NEXT_PUBLIC_DATA_SOURCE as DataSource) || "supabase";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

export function isSupabaseMode() {
  return DATA_SOURCE === "supabase";
}

export function isBackendMode() {
  return DATA_SOURCE === "backend";
}
