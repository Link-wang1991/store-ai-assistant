import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// service_role 客户端：仅在服务端使用，绕过 RLS。
// 注意：这是底层连接，业务代码不应直接 import 它，请通过 lib/db 适配层访问。
// 返回 SupabaseClient<any> 以便在无 Database 泛型时也能自由读写。
let cached: SupabaseClient<any, "public", any> | null = null;

export function supabaseAdmin(): SupabaseClient<any, "public", any> {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY，请检查 .env.local"
    );
  }
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
