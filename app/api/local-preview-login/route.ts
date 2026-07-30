import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/data-source";

export const runtime = "nodejs";

const PREVIEW_MAX_AGE_SECONDS = 4 * 60 * 60;

function isLocalPreviewHost(host: string | null) {
  const value = (host || "").toLowerCase().replace(/^\[/, "").replace(/\].*$/, "").replace(/:\d+$/, "");
  if (["localhost", "127.0.0.1", "::1"].includes(value)) return true;
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
}

/**
 * 本机角色体验的 Next 代理：由后端决定是否允许，成功时才写入短时会话 cookie。
 * 不接收、保存或校验任何员工密码。
 */
export async function POST(req: NextRequest) {
  if (!isLocalPreviewHost(req.headers.get("host"))) {
    return NextResponse.json({ code: 404, message: "本机角色体验仅可通过本机或局域网地址访问" }, { status: 404 });
  }
  try {
    const body = await req.json();
    const response = await fetch(`${API_BASE_URL}/api/auth/local-preview-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Store-AI-Preview-Origin": req.headers.get("host") || "",
        "User-Agent": req.headers.get("user-agent") || "",
      },
      body: JSON.stringify({ employeeId: body?.employeeId }),
      cache: "no-store",
    });
    const json = await response.json();
    if (!response.ok || json.code !== 200 || !json.data?.token) {
      return NextResponse.json(json, { status: response.status || 401 });
    }
    const result = NextResponse.json(json);
    result.cookies.set("store_ai_token", json.data.token, {
      path: "/",
      maxAge: PREVIEW_MAX_AGE_SECONDS,
      sameSite: "lax",
    });
    return result;
  } catch {
    return NextResponse.json({ code: 500, message: "无法连接本机角色体验服务" }, { status: 500 });
  }
}
