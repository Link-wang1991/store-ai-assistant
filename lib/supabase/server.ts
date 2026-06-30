import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// 服务端（Server Component / Route Handler）读取用户 session 的客户端。
// 用 anon key + cookies，仅用来确认"当前登录的是谁"。
export function createSupabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // 在 Server Component 中调用 set 会抛错，可忽略（由 middleware 刷新）
          }
        },
      },
    }
  );
}
