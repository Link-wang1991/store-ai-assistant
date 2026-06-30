"use client";

// 浏览器端登录/登出封装（lib/auth）。页面不直接接触 Supabase。
import { createSupabaseBrowser } from "../supabase/client";

export async function signInWithPassword(email: string, password: string) {
  return createSupabaseBrowser().auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return createSupabaseBrowser().auth.signOut();
}

// 当前登录用户的邮箱（用于角色切换器高亮当前角色）
export async function getCurrentEmail(): Promise<string | null> {
  const { data } = await createSupabaseBrowser().auth.getSession();
  return data.session?.user?.email ?? null;
}
