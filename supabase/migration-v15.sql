-- ============================================================
-- V15 迁移：记录导入名单里「负责人」列写的原始姓名
-- 用途：支持「重新识别负责人」——员工改名/补建后，不用重传名单，
--       直接拿这里存的原始负责人名重新匹配一遍。
-- 在 Supabase SQL Editor 执行。幂等。
-- ============================================================

alter table public.customer_records
  add column if not exists import_owner_name text;

notify pgrst, 'reload schema';
