-- ============================================================
-- 门店 AI 经营助手 —— V2 迁移：经营工具底座
-- 在 Supabase SQL Editor 整段执行（可重复执行，IF NOT EXISTS 安全）
-- 新增：角色定义/权限矩阵、通知、排班、活动、项目、客户、咨询、回访、反馈
-- 安全模型沿用 V1：开启 RLS，不放开匿名访问，统一走服务端 service_role。
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 九：门店自定义角色定义 ----------
create table if not exists public.role_definitions (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  role_key     text not null,                 -- 内置或自定义 key
  display_name text not null,                 -- 门店自定义展示名（如"顾问""皮肤管理师"）
  base_role    text not null,                 -- 基于哪个内置角色模板：owner/manager/consultant/beautician/reception/operator
  status       text not null default 'active',
  sort_order   int  not null default 0,
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (store_id, role_key)
);
create index if not exists idx_roledef_store on public.role_definitions(store_id);

-- ---------- 一：角色权限矩阵 ----------
create table if not exists public.role_permissions (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  role_key   text not null,
  module     text not null,                   -- workbench/customers/followups/schedules/campaigns/projects/knowledge/risks/reports/employees/permissions
  actions    text[] not null default '{}',    -- view/create/edit/delete/assign/review/export/handle_risk
  data_scope text not null default 'self',    -- self/assigned/role/store/all
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, role_key, module)
);
create index if not exists idx_roleperm_store on public.role_permissions(store_id);

-- ---------- 十：通知 / 公告 ----------
create table if not exists public.announcements (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references public.stores(id) on delete cascade,
  title              text not null,
  content            text,
  announcement_type  text not null default 'general', -- training/campaign/schedule/policy/urgent/general
  visible_roles      text[] default '{}',
  target_employee_ids uuid[] default '{}',
  start_at           timestamptz,
  end_at             timestamptz,
  priority           int not null default 0,
  status             text not null default 'active',
  created_by         uuid references public.employees(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_ann_store on public.announcements(store_id);

-- ---------- 七：排班 ----------
create table if not exists public.schedules (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date   date not null,
  shift_label text,                            -- 早班/中班/晚班/休息
  start_time  text,                            -- "10:00"
  end_time    text,                            -- "17:00"
  status      text not null default 'active',
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_sched_store on public.schedules(store_id);
create index if not exists idx_sched_emp_date on public.schedules(employee_id, work_date);

-- ---------- 七：活动（campaigns）----------
create table if not exists public.campaigns (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  name          text not null,
  period        text,
  main_projects text,
  price         text,
  target_customers text,
  stackable     boolean default false,
  staff_script  text,                          -- 员工讲解口径
  reception_script text,                        -- 前台可说版本
  banned_expr   text,                          -- 禁止承诺/禁忌表达
  start_at      timestamptz,
  end_at        timestamptz,
  status        text not null default 'active',
  created_by    uuid references public.employees(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_camp_store on public.campaigns(store_id);

-- ---------- 七：项目 / 套餐 ----------
create table if not exists public.service_projects (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores(id) on delete cascade,
  name            text not null,
  category        text,
  price           text,
  duration        text,                        -- 时长
  efficacy        text,                        -- 功效
  suitable        text,                        -- 适用人群
  contraindication text,                       -- 禁忌
  description     text,
  status          text not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_proj_store on public.service_projects(store_id);

-- ---------- 七：客户记录 ----------
create table if not exists public.customer_records (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  name        text not null,
  phone       text,
  gender      text,
  source      text,                            -- 来源：美团/小红书/转介绍/到店
  stage       text not null default 'new',     -- new/intent/deal/regular/churn_risk
  tags        text[] default '{}',
  assigned_to uuid references public.employees(id),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_cust_store on public.customer_records(store_id);

-- ---------- 七：咨询 / 成交推进记录 ----------
create table if not exists public.consultation_records (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  customer_id  uuid references public.customer_records(id) on delete set null,
  employee_id  uuid references public.employees(id),
  stage        text,                           -- 需求了解/项目推荐/价格异议/效果顾虑/竞品对比/未成交跟进/成交复购
  intent_level text,                           -- 高/中/低
  projects_discussed text,
  objection    text,                           -- 异议点
  result       text,                           -- 成交/未成交/跟进中
  amount       numeric,
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_consult_store on public.consultation_records(store_id);

-- ---------- 七：回访任务 ----------
create table if not exists public.followups (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  customer_id uuid references public.customer_records(id) on delete set null,
  employee_id uuid references public.employees(id),
  type        text,                            -- 新客24h/体验第3天/未成交1-3-7天/老客30-60-90/活动二次触达
  due_at      timestamptz,
  status      text not null default 'todo',    -- todo/done/overdue/canceled
  channel     text,                            -- 微信/电话/到店
  script      text,
  result      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_followup_store on public.followups(store_id);
create index if not exists idx_followup_emp on public.followups(employee_id);

-- ---------- 七：客户反馈 / 满意度 / 未成交原因 ----------
create table if not exists public.customer_feedback (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  customer_id   uuid references public.customer_records(id) on delete set null,
  employee_id   uuid references public.employees(id),
  feedback_type text,                          -- 满意度/服务体验/未成交原因/价格顾虑/效果顾虑/投诉
  score         int,                           -- 满意度评分（可空）
  content       text,
  risk_flag     boolean default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_feedback_store on public.customer_feedback(store_id);

-- ---------- updated_at 触发器 ----------
do $$
declare t text;
begin
  foreach t in array array[
    'role_definitions','role_permissions','announcements','schedules',
    'campaigns','service_projects','customer_records','followups'
  ] loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I', t);
    execute format(
      'create trigger trg_set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------- RLS：开启但不放开匿名访问（统一走 service_role）----------
do $$
declare t text;
begin
  foreach t in array array[
    'role_definitions','role_permissions','announcements','schedules',
    'campaigns','service_projects','customer_records','consultation_records',
    'followups','customer_feedback'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
