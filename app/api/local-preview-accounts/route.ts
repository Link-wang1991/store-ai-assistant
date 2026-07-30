import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/data-source";

export const runtime = "nodejs";

/** 将本机 profile 的角色体验名单转发给当前浏览器；正式环境后端会拒绝此请求。 */
function isLocalPreviewHost(host: string | null) {
  const value = (host || "").toLowerCase().replace(/^\[/, "").replace(/\].*$/, "").replace(/:\d+$/, "");
  if (["localhost", "127.0.0.1", "::1"].includes(value)) return true;
  const parts = value.split(".").map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    && (parts[0] === 10 || parts[0] === 127 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31));
}

export async function GET(request: NextRequest) {
  if (!isLocalPreviewHost(request.headers.get("host"))) return NextResponse.json({ code: 404, message: "本机角色体验不可用" }, { status: 404 });
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/local-preview-accounts`, {
      cache: "no-store",
      headers: {
        "X-Store-AI-Preview-Origin": request.headers.get("host") || "",
        "User-Agent": request.headers.get("user-agent") || "",
      },
    });
    const body = await response.json();
    return NextResponse.json(body, { status: response.ok ? 200 : response.status });
  } catch {
    return NextResponse.json({ code: 500, message: "无法连接本机角色体验服务" }, { status: 500 });
  }
}
