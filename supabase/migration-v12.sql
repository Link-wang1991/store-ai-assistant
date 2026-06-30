-- ============================================================
-- V12 迁移：门店自定义配置（code + display_name）
-- 在 Supabase SQL Editor 执行。幂等。
-- 用途：让门店在「我的 → 自定义配置」里改名/新增/删除/启用隐藏/排序，
--       系统逻辑用 code，页面展示用 display_name。一类配置整体替换保存。
-- ============================================================

create table if not exists public.store_config (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  category         text not null,                 -- role / pool / stage / scene / knowledge ...
  code             text not null,                 -- 系统逻辑用的稳定标识
  display_name     text not null,                 -- 门店自定义的显示名
  enabled          boolean not null default true, -- 是否启用（停用＝隐藏）
  visible_to_staff boolean not null default true, -- 员工是否可见
  sort_order       int not null default 0,        -- 排序
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (store_id, category, code)
);

create index if not exists idx_store_config_store_cat
  on public.store_config(store_id, category, sort_order);
