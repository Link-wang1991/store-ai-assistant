-- ============================================================
-- V4 迁移：系统内置增长方法论知识库（门店专属 Hermes 的"经营大脑"底座）
-- 在 Supabase SQL Editor 执行。
-- growth_playbooks 是系统级知识（store_id 为 null = 全局共享）；
-- 预留 store_id 非空用于门店自定义方法论（第二阶段）。
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.growth_playbooks (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid references public.stores(id) on delete cascade, -- null = 系统全局
  scenario_key        text not null,                 -- 场景唯一标识
  module              text not null,                 -- 销售成交/消费者心理/客户分型/服务体验/老客复购/活动转化/行为设计/合规风险
  title               text not null,
  scene               text,                          -- 场景描述
  customer_psychology text,                          -- 客户真实心理
  common_mistakes     text,                          -- 员工常见误区
  strategy            text,                          -- 推荐策略
  scripts             text,                          -- 建议话术
  follow_up_questions text,                          -- 追问问题
  next_action         text,                          -- 下一步动作
  risk_note           text,                          -- 风险提醒
  applicable_roles    text[] default '{}',           -- 适用角色（base_role）
  applicable_stages   text[] default '{}',           -- 适用客户阶段
  status              text not null default 'active',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_playbook_module on public.growth_playbooks(module);
create unique index if not exists uq_playbook_scenario
  on public.growth_playbooks(coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid), scenario_key);

alter table public.growth_playbooks enable row level security;

-- ============================================================
-- 预留（第二阶段长记忆，先建表不深用）：客户互动、记忆条目、增长机会
-- ============================================================
create table if not exists public.customer_interactions (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  customer_id uuid references public.customer_records(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  channel     text,
  summary     text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_cinter_store on public.customer_interactions(store_id);

create table if not exists public.memory_items (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  scope       text,                                  -- store / customer / employee
  ref_id      uuid,
  key         text,
  value       text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_memory_store on public.memory_items(store_id);

create table if not exists public.growth_opportunities (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  type        text,                                  -- followup/reactivation/upsell/recovery
  title       text,
  customer_id uuid references public.customer_records(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  priority    int default 0,
  status      text not null default 'open',
  created_at  timestamptz not null default now()
);
create index if not exists idx_opp_store on public.growth_opportunities(store_id);

do $$
declare t text;
begin
  foreach t in array array['growth_playbooks','customer_interactions','memory_items','growth_opportunities'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
