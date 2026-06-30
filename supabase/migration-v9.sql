-- ============================================================
-- V9 迁移：增长机会业务化（门店专属 Hermes —— 今日最该抓的机会）
-- 在 Supabase SQL Editor 执行。幂等。
-- 目标：让每个增长机会不只是一条任务，而是一张「可执行的成交/复购卡」：
--   为什么值得跟、当前阻碍、建议怎么开口、下一步目标。
-- 配合 AI 旁路按 6 类来源产出（新客未转化/体验未成交/老客沉默/高客维护/活动适配/服务回访）。
-- ============================================================

alter table public.growth_opportunities add column if not exists reason  text; -- 为什么值得跟
alter table public.growth_opportunities add column if not exists blocker text; -- 当前阻碍 / 成交障碍
alter table public.growth_opportunities add column if not exists opening text; -- 建议怎么开口（话术）
alter table public.growth_opportunities add column if not exists goal    text; -- 下一步目标
