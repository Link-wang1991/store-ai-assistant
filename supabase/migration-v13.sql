-- ============================================================
-- V13 迁移：growth_playbooks 权威来源字段
-- 在 Supabase SQL Editor 执行。幂等。
-- seed-playbooks.mjs 会写入 source，用于 AI 回答展示理论依据/参考知识来源。
-- ============================================================

alter table public.growth_playbooks
  add column if not exists source text;

notify pgrst, 'reload schema';
