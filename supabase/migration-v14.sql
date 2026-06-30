-- ============================================================
-- V14 迁移：客户到店/成交真实字段（让机会池「今日到店 / 新成交」有数据）
-- 在 Supabase SQL Editor 执行。幂等。
-- last_visit_at：最近一次到店（记录「到店」互动时写入）
-- last_deal_at ：最近一次成交（客户阶段改为「已成交」时写入）
-- total_spent  ：累计消费（预留，后续接消费录入）
-- ============================================================

alter table public.customer_records
  add column if not exists last_visit_at timestamptz,
  add column if not exists last_deal_at  timestamptz,
  add column if not exists total_spent   numeric default 0;

notify pgrst, 'reload schema';
