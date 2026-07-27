import { redirect } from "next/navigation";
import { getServerToken } from "@/lib/api-client";
import { API_BASE_URL } from "@/lib/data-source";

export const dynamic = "force-dynamic";

/**
 * 管理端权限在服务端验证，避免手机刚通过免密链接时等待客户端脚本加载而永久
 * 停在“正在验证管理权限”。数据接口仍由 Java 后端进行二次授权。
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const token = await getServerToken();
  if (!token) redirect("/login");

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const result = await response.json();
    const role = result?.data?.role;
    if (!response.ok || result?.code !== 200) redirect("/login");
    if (!["owner", "manager", "admin"].includes(role)) redirect("/home");
  } catch {
    redirect("/login");
  }

  return <div className="admin-shell min-h-screen">{children}</div>;
}
