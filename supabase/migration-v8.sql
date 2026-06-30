-- ============================================================
-- V8 迁移：语义/向量检索（门店专属 Hermes 第三阶段·第 3 项）
-- 在 Supabase SQL Editor 执行。幂等。
-- 目标：把知识库片段与系统方法论从 bigram 关键词匹配升级为语义召回。
--   embedding 用千问 text-embedding-v3（1024 维）。
--   检索走 RPC 函数（向量余弦距离），应用层向量优先、失败回退 bigram。
-- 执行后需跑回填脚本：npx tsx --env-file=.env.local scripts/backfill-embeddings.ts
-- ============================================================

create extension if not exists vector;

-- ---------- 向量列（1024 维，与 text-embedding-v3 对齐）----------
alter table public.knowledge_chunks   add column if not exists embedding vector(1024);
alter table public.growth_playbooks   add column if not exists embedding vector(1024);

-- ---------- 余弦距离 HNSW 索引（数据量小时 ivfflat 亦可，hnsw 免训练）----------
create index if not exists idx_kchunk_embedding
  on public.knowledge_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists idx_playbook_embedding
  on public.growth_playbooks using hnsw (embedding vector_cosine_ops);

-- ============================================================
-- 检索 RPC：知识库片段（按 store + 角色可见 + active 过滤）
-- 返回 score = 1 - 余弦距离（越大越相关）
-- ============================================================
create or replace function public.match_knowledge_chunks(
  p_store_id uuid,
  p_role     text,
  p_query    vector(1024),
  p_count    int
)
returns table (id uuid, title text, content text, category text, score float)
language sql stable
as $$
  select c.id, c.title, c.content, c.category,
         1 - (c.embedding <=> p_query) as score
  from public.knowledge_chunks c
  where c.store_id = p_store_id
    and c.status = 'active'
    and c.visible_roles @> array[p_role]
    and c.embedding is not null
  order by c.embedding <=> p_query
  limit p_count;
$$;

-- ============================================================
-- 检索 RPC：系统增长方法论（系统全局 store_id is null 或本店；按 base_role 过滤）
-- ============================================================
create or replace function public.match_growth_playbooks(
  p_store_id uuid,
  p_role     text,
  p_query    vector(1024),
  p_count    int
)
returns table (
  id uuid, scenario_key text, module text, title text, scene text,
  customer_psychology text, strategy text, scripts text,
  follow_up_questions text, next_action text, risk_note text, score float
)
language sql stable
as $$
  select p.id, p.scenario_key, p.module, p.title, p.scene,
         p.customer_psychology, p.strategy, p.scripts,
         p.follow_up_questions, p.next_action, p.risk_note,
         1 - (p.embedding <=> p_query) as score
  from public.growth_playbooks p
  where p.status = 'active'
    and (p.store_id is null or p.store_id = p_store_id)
    and (coalesce(array_length(p.applicable_roles, 1), 0) = 0
         or p.applicable_roles @> array[p_role])
    and p.embedding is not null
  order by p.embedding <=> p_query
  limit p_count;
$$;
