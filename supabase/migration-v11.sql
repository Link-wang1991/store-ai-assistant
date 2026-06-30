-- ============================================================
-- V11 迁移：会谈审计日志保留（录音安全与内测稳定性）
-- 在 Supabase SQL Editor 执行。幂等。
-- 问题：meeting_access_logs.meeting_id 原为 on delete cascade，删会谈会连带删审计日志，
--       导致"谁删了录音/会谈"的审计失效。改为 on delete set null，删会谈后日志仍保留。
-- 注：会谈录音私有桶 meeting-audio 由 scripts/setup-storage.ts 创建，无需 SQL。
-- ============================================================

alter table public.meeting_access_logs
  drop constraint if exists meeting_access_logs_meeting_id_fkey;

alter table public.meeting_access_logs
  add constraint meeting_access_logs_meeting_id_fkey
  foreign key (meeting_id) references public.meeting_sessions(id) on delete set null;
