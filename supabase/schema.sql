-- ============================================================
-- 门店私有化 AI 经营助手 —— 数据库 Schema
-- 在 Supabase SQL Editor 里整段执行即可
-- 安全模型：所有业务表开启 RLS 且不开放给 anon/authenticated 直接访问，
--           全部数据读写通过服务端 service_role（应用层做门店隔离 + 角色校验）。
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------- 通用：updated_at 自动维护 ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 15.1 stores 门店表
-- ============================================================
create table if not exists public.stores (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  brand_name    text,
  industry_type text,                       -- 美容院/皮肤管理/SPA/轻医美
  address       text,
  owner_id      uuid,                        -- 关联 users.id（创建后回填）
  status        text not null default 'active',  -- active / disabled
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- 15.2 users 用户表（与 Supabase Auth 关联）
-- ============================================================
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique,                 -- = auth.users.id
  name          text,
  phone         text,
  email         text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- 15.3 employees 员工表
-- ============================================================
create table if not exists public.employees (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  name        text not null,
  phone       text,
  role        text not null check (role in
              ('owner','manager','consultant','beautician','receptionist','operator')),
  position    text,
  status      text not null default 'active', -- active / disabled
  joined_at   date default current_date,
  disabled_at timestamptz,
  notes       text,                           -- 老板备注（店长不可见）
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_employees_store on public.employees(store_id);
create index if not exists idx_employees_user  on public.employees(user_id);

-- ============================================================
-- 15.4 roles 角色定义表（说明 + 权限点，主要供展示/配置）
-- ============================================================
create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  permissions jsonb default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- 15.5 knowledge_documents 知识库文档表
-- ============================================================
create table if not exists public.knowledge_documents (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  title         text not null,
  category      text not null,
  file_url      text,
  file_type     text,                         -- md/txt/docx/pdf
  visible_roles text[] not null default '{}', -- 哪些角色可见
  tags          text[] default '{}',
  status        text not null default 'active', -- active / disabled
  version       int not null default 1,
  uploaded_by   uuid references public.employees(id),
  remark        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_kdoc_store on public.knowledge_documents(store_id);

-- ============================================================
-- 15.6 knowledge_chunks 知识片段表
-- ============================================================
create table if not exists public.knowledge_chunks (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  document_id   uuid not null references public.knowledge_documents(id) on delete cascade,
  title         text,
  content       text not null,
  category      text,
  visible_roles text[] not null default '{}',
  tags          text[] default '{}',
  source        text,
  status        text not null default 'active',
  version       int not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_kchunk_store on public.knowledge_chunks(store_id);
create index if not exists idx_kchunk_doc   on public.knowledge_chunks(document_id);
-- 简单全文/模糊检索辅助（第一版用关键词匹配）
create index if not exists idx_kchunk_content_trgm
  on public.knowledge_chunks using gin (content gin_trgm_ops);

-- ============================================================
-- 15.7 chat_sessions 对话会话表
-- ============================================================
create table if not exists public.chat_sessions (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  role        text,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_session_emp on public.chat_sessions(employee_id);

-- ============================================================
-- 15.8 chat_messages 对话消息表
-- ============================================================
create table if not exists public.chat_messages (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.chat_sessions(id) on delete cascade,
  store_id          uuid not null references public.stores(id) on delete cascade,
  employee_id       uuid not null references public.employees(id) on delete cascade,
  role              text,
  user_message      text not null,
  ai_response       text,
  retrieved_chunks  jsonb default '[]'::jsonb,
  question_category text,
  risk_level        text,                     -- L1/L2/L3/L4
  answer_type       text,                     -- knowledge/general/need_confirm/risk
  needs_review      boolean default false,
  created_at        timestamptz not null default now()
);
create index if not exists idx_msg_session on public.chat_messages(session_id);
create index if not exists idx_msg_store   on public.chat_messages(store_id);
create index if not exists idx_msg_emp     on public.chat_messages(employee_id);

-- ============================================================
-- 15.9 pending_questions 待确认问题表
-- ============================================================
create table if not exists public.pending_questions (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  question      text not null,
  ai_suggestion text,
  category      text,
  risk_level    text,
  status        text not null default 'pending', -- pending/replied/added/closed
  assigned_to   uuid references public.employees(id),
  owner_reply   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_pending_store on public.pending_questions(store_id);

-- ============================================================
-- 15.10 knowledge_gaps 知识库缺口表
-- ============================================================
create table if not exists public.knowledge_gaps (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  employee_id   uuid references public.employees(id) on delete set null,
  question      text not null,
  category      text,
  frequency     int not null default 1,
  ai_temp_answer text,
  status        text not null default 'pending', -- pending/added/closed
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_gap_store on public.knowledge_gaps(store_id);

-- ============================================================
-- 15.11 risk_logs 风险记录表
-- ============================================================
create table if not exists public.risk_logs (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  employee_id    uuid references public.employees(id) on delete set null,
  question       text not null,
  ai_response    text,
  risk_type      text,
  risk_level     text not null default 'L4',
  status         text not null default 'open', -- open/handling/closed
  handled_by     uuid references public.employees(id),
  handled_result text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_risk_store on public.risk_logs(store_id);

-- ============================================================
-- 15.12 tasks 任务表
-- ============================================================
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  title         text not null,
  content       text,
  task_type     text,
  assigned_to   uuid references public.employees(id) on delete set null,
  assigned_role text,
  deadline      timestamptz,
  status        text not null default 'todo', -- todo/doing/done/overdue/canceled
  created_by    uuid references public.employees(id),
  completed_at  timestamptz,
  feedback      text,
  owner_comment text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_task_store on public.tasks(store_id);
create index if not exists idx_task_assignee on public.tasks(assigned_to);

-- ============================================================
-- 15.13 reports 报告表
-- ============================================================
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  report_type text not null,                 -- daily / weekly
  date_range  text,
  content     jsonb default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_report_store on public.reports(store_id);

-- ============================================================
-- 15.14 activity_logs 操作日志表
-- ============================================================
create table if not exists public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid references public.stores(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  action_type text,
  target_type text,
  target_id   uuid,
  metadata    jsonb default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 附加表：禁用词 / 标准答案 / 活动（功能需要，文档第八、十章）
-- ============================================================
create table if not exists public.banned_words (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  word       text not null,
  reason     text,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  unique (store_id, word)
);
create index if not exists idx_banned_store on public.banned_words(store_id);

create table if not exists public.standard_answers (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  question    text not null,
  answer      text not null,
  category    text,
  visible_roles text[] default '{}',
  source_message_id uuid references public.chat_messages(id) on delete set null,
  created_by  uuid references public.employees(id),
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_stdans_store on public.standard_answers(store_id);

create table if not exists public.activities (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  name          text not null,
  period        text,
  main_projects text,
  price         text,
  target_customers text,
  stackable     boolean default false,
  staff_script  text,
  moments_copy  text,
  xhs_copy      text,
  banned_expr   text,
  tasks         text,
  review        text,
  status        text not null default 'active',
  created_by    uuid references public.employees(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_activity_store on public.activities(store_id);

-- ============================================================
-- updated_at 触发器
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'stores','users','employees','roles','knowledge_documents','knowledge_chunks',
    'chat_sessions','pending_questions','knowledge_gaps','risk_logs','tasks',
    'reports','standard_answers','activities'
  ] loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I', t);
    execute format(
      'create trigger trg_set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ============================================================
-- store_config：门店自定义配置（code + display_name）。详见 migration-v12.sql。
-- ============================================================
create table if not exists public.store_config (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  category         text not null,
  code             text not null,
  display_name     text not null,
  enabled          boolean not null default true,
  visible_to_staff boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (store_id, category, code)
);
create index if not exists idx_store_config_store_cat
  on public.store_config(store_id, category, sort_order);

-- ============================================================
-- RLS：开启所有业务表的行级安全。
-- 不为 anon/authenticated 添加任何 policy ⇒ 默认拒绝直接访问。
-- service_role 默认绕过 RLS，所有数据访问统一走服务端 API（应用层做隔离）。
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'stores','users','employees','roles','knowledge_documents','knowledge_chunks',
    'chat_sessions','chat_messages','pending_questions','knowledge_gaps','risk_logs',
    'tasks','reports','activity_logs','banned_words','standard_answers','activities',
    'store_config'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
