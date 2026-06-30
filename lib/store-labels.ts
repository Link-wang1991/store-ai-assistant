import { db } from "@/lib/db";

// ============================================================
// C2：读门店自定义显示名 —— 让「自定义配置」里改的名字真正全店生效。
// 返回 { category: { code: display_name } }，只含启用项。
// 系统逻辑始终用 code，展示层用这里的 display_name 覆盖默认。
// ============================================================
export async function getStoreLabels(
  storeId: string
): Promise<Record<string, Record<string, string>>> {
  let saved: any[] = [];
  try {
    saved = (await db.config.listByStore(storeId)) as any[];
  } catch {
    saved = [];
  }
  const out: Record<string, Record<string, string>> = {};
  for (const r of saved) {
    if (r.enabled === false) continue;
    (out[r.category] = out[r.category] || {})[r.code] = r.display_name;
  }
  return out;
}
