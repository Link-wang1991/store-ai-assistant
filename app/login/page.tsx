import { LoginClient, type LocalPreviewAccount } from "@/components/LoginClient";
import { API_BASE_URL } from "@/lib/data-source";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * 预取本机角色名单，使移动端在客户端脚本延后、缓存恢复时仍能直接看到入口。
 * 正式环境的后端默认拒绝该接口，届时自然不渲染这一区块。
 */
async function loadLocalPreviewAccounts(): Promise<LocalPreviewAccount[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${API_BASE_URL}/api/auth/local-preview-accounts`, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const result = await response.json();
    return response.ok && result?.code === 200 && Array.isArray(result.data) ? result.data : [];
  } catch {
    return [];
  }
}

export default async function LoginPage() {
  const initialPreviewAccounts = await loadLocalPreviewAccounts();
  return <LoginClient initialPreviewAccounts={initialPreviewAccounts} />;
}
