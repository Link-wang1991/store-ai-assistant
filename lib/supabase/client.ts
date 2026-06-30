"use client";

import { createBrowserClient } from "@supabase/ssr";

// 浏览器端客户端：只用于 Auth（登录/登出/获取 session），不直接读写业务表。
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
