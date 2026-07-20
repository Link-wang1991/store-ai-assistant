// ============================================================
// 服务端 cookie 读取工具（仅限 Server Component / Route Handler 使用）
// 静态导入 next/headers，避免动态 import 丢失请求上下文
// ============================================================

import { cookies } from "next/headers";

export async function readServerToken(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get("store_ai_token")?.value ?? null;
  } catch {
    return null;
  }
}
