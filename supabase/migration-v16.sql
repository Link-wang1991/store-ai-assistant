-- ============================================================
-- V16 迁移：让客户导入「不丢源数据 + 不静默误分配 + 可重新整理」
-- import_raw         ：保存每位客户导入时的原始行 JSON（即使某次漏映射字段，源数据仍在，可重新整理）
-- owner_match_status ：负责人匹配状态 matched/suspect/unmatched，前端据此提示「疑似/待确认」
-- 在 Supabase SQL Editor 执行。幂等。
-- ============================================================

alter table public.customer_records
  add column if not exists import_raw jsonb,
  add column if not exists owner_match_status text;

notify pgrst, 'reload schema';
