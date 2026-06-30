-- ============================================================
-- V3 迁移：支持门店自定义角色 role_key（放开 employees.role 固定枚举）
-- 在 Supabase SQL Editor 执行。安全、不破坏历史数据。
-- 自定义角色通过 role_definitions.role_key 管理，base_role 决定工作台与权限模板。
-- ============================================================

alter table public.employees drop constraint if exists employees_role_check;

-- 说明：放开后 employees.role 可存任意 role_key（内置或门店自定义）。
-- 权限与工作台分发统一通过 role_definitions.base_role 继承。
