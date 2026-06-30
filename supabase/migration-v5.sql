-- ============================================================
-- V5 迁移：客户档案深化 + 长记忆落库（门店专属 Hermes 第二阶段）
-- 在 Supabase SQL Editor 执行。幂等（add column if not exists）。
-- 目标：把客户从"一条名片"升级为"可经营的画像"，并让 AI 能读写客户记忆。
-- ============================================================

-- ---------- customer_records 深化字段 ----------
alter table public.customer_records add column if not exists personality        text; -- 性格底色：谨慎理性/感性冲动/社交型/务实型…
alter table public.customer_records add column if not exists spending_power     text; -- 消费能力：高/中/低
alter table public.customer_records add column if not exists decision_style     text; -- 决策风格：自己拍板/需家人同意/货比三家/冲动型
alter table public.customer_records add column if not exists communication_pref text; -- 沟通偏好：微信文字/电话/到店聊/少打扰
alter table public.customer_records add column if not exists concerns           text; -- 当前顾虑/成交阻碍
alter table public.customer_records add column if not exists repurchase_opp     text; -- 复购 / 升单机会点
alter table public.customer_records add column if not exists next_follow_at     timestamptz; -- 下次跟进时间
alter table public.customer_records add column if not exists last_contact_at    timestamptz; -- 最近一次互动时间
alter table public.customer_records add column if not exists ai_suggestion      text;        -- 最近一次 AI 下一步建议（落库）
alter table public.customer_records add column if not exists ai_suggested_at    timestamptz; -- AI 建议生成时间

create index if not exists idx_cust_next_follow on public.customer_records(store_id, next_follow_at);

-- ---------- customer_interactions：客户互动时间线（长记忆原始流水）----------
-- 已在 v4 建表，这里补充常用字段（幂等）。
alter table public.customer_interactions add column if not exists kind  text; -- followup/feedback/ai_suggestion/note/visit
alter table public.customer_interactions add column if not exists title text;
create index if not exists idx_cinter_customer on public.customer_interactions(customer_id, created_at desc);

-- ---------- memory_items：结构化长记忆（key/value，可供 AI 快速读取）----------
-- 已在 v4 建表。补充唯一约束：同一 scope+ref_id+key 只保留最新一条（便于 upsert 画像要点）。
create unique index if not exists uq_memory_scope_key
  on public.memory_items(store_id, scope, ref_id, key);

-- ---------- growth_opportunities：增长机会（待跟进/唤醒/升单/补救）----------
-- 已在 v4 建表。补充 due_at 便于排程。
alter table public.growth_opportunities add column if not exists due_at timestamptz;
alter table public.growth_opportunities add column if not exists note   text;
create index if not exists idx_opp_status on public.growth_opportunities(store_id, status, priority desc);

-- ---------- updated_at 触发器（customer_records 已在 v2 注册，无需重复）----------
