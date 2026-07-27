import { NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/data-source";

export const runtime = "nodejs";

/** 将本机 profile 的角色体验名单转发给当前浏览器；正式环境后端会拒绝此请求。 */
export async function GET() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/local-preview-accounts`, { cache: "no-store" });
    const body = await response.json();
    return NextResponse.json(body, { status: response.ok ? 200 : response.status });
  } catch {
    return NextResponse.json({ code: 500, message: "无法连接本机角色体验服务" }, { status: 500 });
  }
}
