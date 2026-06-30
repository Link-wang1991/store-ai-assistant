-- ============================================================
-- V10 迁移：客户进店会谈复盘助手（门店专属 Hermes 核心特色功能）
-- 在 Supabase SQL Editor 执行。
-- 录音只是入口，分析才是价值，沉淀才是壁垒——结果反哺客户/员工/门店记忆 + 机会 + 风险。
-- 所有表按 store_id 隔离；启用 RLS（服务端走 service_role）。
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 会谈会话 ----------
create table if not exists public.meeting_sessions (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  customer_id      uuid references public.customer_records(id) on delete set null,
  employee_id      uuid references public.employees(id) on delete set null,
  scene            text,                       -- 新客咨询/项目介绍/成交咨询/服务前沟通/服务中沟通/服务后反馈/老客复购/客诉处理
  status           text not null default 'recording', -- recording/uploaded/transcribing/analyzing/done/failed
  started_at       timestamptz,
  ended_at         timestamptz,
  duration         int,                        -- 秒
  consent_status   text default 'pending',     -- pending/agreed/declined
  consent_text     text,
  audio_url        text,
  asr_task_id      text,                        -- 阿里云 Paraformer 异步任务 id
  transcript_status text default 'pending',    -- pending/done/failed
  analysis_status  text default 'pending',     -- pending/done/failed
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_meeting_store on public.meeting_sessions(store_id, created_at desc);
create index if not exists idx_meeting_customer on public.meeting_sessions(store_id, customer_id);
create index if not exists idx_meeting_employee on public.meeting_sessions(store_id, employee_id);

-- ---------- 转写分句（含说话人）----------
create table if not exists public.meeting_transcripts (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid not null references public.meeting_sessions(id) on delete cascade,
  store_id     uuid not null references public.stores(id) on delete cascade,
  speaker      text,            -- ASR 原始说话人标识（speaker_0/speaker_1…）
  speaker_role text,            -- 语义角色：employee/customer/manager/other（可人工修正）
  start_time   numeric,         -- 秒
  end_time     numeric,
  content      text,
  confidence   numeric,
  seq          int,             -- 句序，便于排序
  created_at   timestamptz not null default now()
);
create index if not exists idx_mtrans_meeting on public.meeting_transcripts(meeting_id, seq);

-- ---------- 会谈分析报告（21 段结构化）----------
create table if not exists public.meeting_analysis (
  id                      uuid primary key default gen_random_uuid(),
  meeting_id              uuid not null references public.meeting_sessions(id) on delete cascade,
  store_id                uuid not null references public.stores(id) on delete cascade,
  customer_id             uuid references public.customer_records(id) on delete set null,
  employee_id             uuid references public.employees(id) on delete set null,
  summary                 text,   -- 会谈摘要
  key_points              text,   -- 谈话重点提炼
  explicit_needs          text,   -- 客户显性需求
  implicit_needs          text,   -- 客户隐性需求
  emotional_needs         text,   -- 客户情绪需求
  decision_barriers       text,   -- 客户决策阻碍
  customer_personality    text,   -- 客户性格底色
  customer_comm_pref      text,   -- 客户沟通偏好
  customer_spending_power text,   -- 客户消费能力判断
  employee_did_well       text,   -- 员工沟通做得好的地方
  employee_to_improve     text,   -- 员工沟通存在的问题
  missed_opportunities    text,   -- 错失的成交/复购机会
  service_experience_risk text,   -- 服务体验风险
  compliance_risks        text,   -- 合规风险
  followup_goal           text,   -- 下一步跟进目标
  suggested_followup_at   timestamptz, -- 建议跟进时间
  suggested_script        text,   -- 建议话术
  need_manager_involved   boolean default false, -- 是否需要店长/老板介入
  memory_to_create        jsonb,  -- 需沉淀的客户/员工/门店记忆（结构化）
  created_at              timestamptz not null default now()
);
create index if not exists idx_manalysis_meeting on public.meeting_analysis(meeting_id);

-- ---------- 录音知情同意 ----------
create table if not exists public.meeting_consents (
  id             uuid primary key default gen_random_uuid(),
  meeting_id     uuid not null references public.meeting_sessions(id) on delete cascade,
  store_id       uuid not null references public.stores(id) on delete cascade,
  customer_id    uuid references public.customer_records(id) on delete set null,
  consent_method text,        -- verbal/checkbox
  consent_text   text,
  consented_at   timestamptz,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now()
);

-- ---------- 音频文件（支持删除/审计）----------
create table if not exists public.audio_files (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  meeting_id       uuid references public.meeting_sessions(id) on delete cascade,
  file_url         text,
  file_path        text,        -- storage 路径，便于删除
  file_size        bigint,
  duration         int,
  format           text,
  upload_status    text default 'uploaded',
  storage_provider text,
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index if not exists idx_audio_store on public.audio_files(store_id, created_at desc);

-- ---------- 会谈数据访问审计日志（合规：访问录音/转写须留痕）----------
create table if not exists public.meeting_access_logs (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  meeting_id  uuid references public.meeting_sessions(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  action      text,        -- view_transcript/play_audio/delete_audio/delete_transcript
  created_at  timestamptz not null default now()
);
create index if not exists idx_maccess_store on public.meeting_access_logs(store_id, created_at desc);

-- ---------- updated_at 触发器 ----------
create or replace function public.touch_meeting_updated_at()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists trg_meeting_updated_at on public.meeting_sessions;
create trigger trg_meeting_updated_at before update on public.meeting_sessions
  for each row execute function public.touch_meeting_updated_at();

-- ---------- 启用 RLS（服务端 service_role 绕过；应用层按 store_id 隔离）----------
do $$
declare t text;
begin
  foreach t in array array[
    'meeting_sessions','meeting_transcripts','meeting_analysis',
    'meeting_consents','audio_files','meeting_access_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
