import { ROLE_LABELS, type Role } from "./constants";

// 解析角色显示名：优先门店自定义名 → 内置名 → 原始 key
export function roleLabel(
  roleKey: string | null | undefined,
  labels?: Record<string, string>
): string {
  if (!roleKey) return "";
  return labels?.[roleKey] || ROLE_LABELS[roleKey as Role] || roleKey;
}
