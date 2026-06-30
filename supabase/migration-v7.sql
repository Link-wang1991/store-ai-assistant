-- ============================================================
-- V7 迁移：增长机会引擎（门店专属 Hermes 第三阶段·第 2 项）
-- 在 Supabase SQL Editor 执行。幂等。
-- 目标：让闲置的 growth_opportunities 真正跑起来——
--   AI 旁路自动产出（升单/复购/唤醒/补救）+ 客户档案跟进自动生成机会，
--   作战室统一展示"该抓的增长机会"。followups 保留为员工执行清单，不动。
-- ============================================================

-- 来源标记：ai_extract（AI 旁路）/ manual（档案跟进）/ rule（规则）
alter table public.growth_opportunities add column if not exists source     text;
alter table public.growth_opportunities add column if not exists updated_at timestamptz not null default now();

-- 按客户+类型去重读取（同一客户同一类型只保留一条 open，靠应用层 upsertOpen 维护）
create index if not exists idx_opp_customer_type
  on public.growth_opportunities(store_id, customer_id, type, status);

-- updated_at 自动刷新
create or replace function public.touch_opp_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_opp_updated_at on public.growth_opportunities;
create trigger trg_opp_updated_at
  before update on public.growth_opportunities
  for each row execute function public.touch_opp_updated_at();
