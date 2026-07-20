import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/data-source";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_AUDIO_BYTES = 60 * 1024 * 1024;

/** 以同源方式播放私有原始录音，浏览器不会直接获得后端存储地址。 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "未登录" }, { status: 401 });

  try {
    const token = req.cookies.get("store_ai_token")?.value;
    const audioRes = await fetch(`${API_BASE_URL}/api/meetings/${id}/audio`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    });
    if (!audioRes.ok || !audioRes.body) {
      return NextResponse.json({ error: "录音暂不可播放" }, { status: audioRes.status || 502 });
    }
    return new NextResponse(audioRes.body, {
      status: audioRes.status,
      headers: {
        "Content-Type": audioRes.headers.get("content-type") || "audio/webm",
        "Content-Disposition": audioRes.headers.get("content-disposition") || "inline",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "录音暂不可播放" }, { status: 502 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > MAX_AUDIO_BYTES + 32 * 1024) {
    return NextResponse.json({ error: "录音文件过大（超过 60MB）" }, { status: 413 });
  }
  const contentType = req.headers.get("content-type");
  if (!contentType?.includes("multipart/form-data") || !req.body) {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  try {
    const token = req.cookies.get("store_ai_token")?.value;
    // 直接流式转发原始 multipart；不再在 Next 内存中复制整段录音。
    const uploadRes = await fetch(`${API_BASE_URL}/api/meetings/${id}/audio`, {
      method: "POST",
      headers: { "Content-Type": contentType, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: req.body,
      // Node.js fetch 转发 ReadableStream 时必须显式标注 duplex。
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const uploadJson = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok || uploadJson.code !== 200) {
      throw new Error(uploadJson.message || "录音上传失败");
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "上传处理失败" }, { status: 500 });
  }
}
