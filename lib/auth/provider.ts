// ============================================================
// 认证 Provider（lib/auth）—— 底层认证服务，当前用 Supabase Auth。
// 这是唯一接触 Supabase Auth 的服务端文件。
// 迁移到其他认证方案时，只需替换本文件的实现。
// ============================================================

import { createSupabaseServer } from "../supabase/server";
import { supabaseAdmin } from "../supabase/admin";

// 读取当前请求的登录用户 id（无则 null）
export async function getSessionAuthUserId(): Promise<string | null> {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// 创建登录账号，返回认证系统中的用户 id
export async function createAccount(
  email: string,
  password: string
): Promise<{ authUserId: string }> {
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
  return { authUserId: data.user!.id };
}

// 删除登录账号（停用员工时可选调用）
export async function deleteAccount(authUserId: string): Promise<void> {
  await supabaseAdmin().auth.admin.deleteUser(authUserId);
}
