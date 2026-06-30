-- ============================================================
-- V6 迁移：长记忆自动沉淀闭环（门店专属 Hermes 第三阶段·第 1 项）
-- 在 Supabase SQL Editor 执行。幂等（add column if not exists）。
-- 目标：让 AI 每次对话后把结构化要点写入 memory_items，
--       并标记来源与置信度，供回写画像与未来检索使用。
-- ============================================================

-- ---------- memory_items：补充来源与置信度 ----------
alter table public.memory_items add column if not exists confidence numeric; -- 0~1，AI 抽取的置信度
alter table public.memory_items add column if not exists source     text;    -- ai_extract / manual / import…
alter table public.memory_items add column if not exists updated_at timestamptz not null default now();

-- 抽取要点按"客户 + 最近更新"读取，建索引
create index if not exists idx_memory_customer_updated
  on public.memory_items(store_id, scope, ref_id, updated_at desc);

-- upsert 时刷新 updated_at（uq_memory_scope_key 已在 v5 建立）
create or replace function public.touch_memory_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_memory_updated_at on public.memory_items;
create trigger trg_memory_updated_at
  before update on public.memory_items
  for each row execute function public.touch_memory_updated_at();
