-- ============================================================
-- Migration V17: AI 回答反馈表
-- 让员工可以对 AI 回答标注"有用/没用"，形成效果追踪闭环
-- ============================================================

create table if not exists public.ai_feedback (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores(id) on delete cascade,
  employee_id     uuid not null references public.employees(id) on delete cascade,
  message_id      uuid not null references public.chat_messages(id) on delete cascade,
  is_helpful      boolean not null,           -- true=有用 / false=没用
  comment         text,                        -- 可选：员工补充说明
  created_at      timestamptz not null default now()
);

create index if not exists idx_ai_feedback_store   on public.ai_feedback(store_id);
create index if not exists idx_ai_feedback_msg     on public.ai_feedback(message_id);
create index if not exists idx_ai_feedback_emp     on public.ai_feedback(employee_id);

-- 每个员工对每条消息只能反馈一次（upsert 用）
create unique index if not exists idx_ai_feedback_unique
  on public.ai_feedback(employee_id, message_id);

-- ============================================================
-- 自动更新时间触发器
-- ============================================================
create or replace function public.ai_feedback_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ai_feedback 添加 updated_at 列
alter table public.ai_feedback add column if not exists updated_at timestamptz;

drop trigger if exists trg_ai_feedback_updated_at on public.ai_feedback;
create trigger trg_ai_feedback_updated_at
  before update on public.ai_feedback
  for each row execute function public.ai_feedback_updated_at();
