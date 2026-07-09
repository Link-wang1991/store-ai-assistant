import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/data-source";
import { getServerToken } from "@/lib/api-client";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const file = form.get("file") as File | null;
  const duration = Math.max(0, parseInt((form.get("duration") as string) || "0", 10));
  if (!file || file.size === 0) return NextResponse.json({ error: "没有录音文件" }, { status: 400 });
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "录音文件过大（超过 100MB）" }, { status: 413 });
  }

  try {
    const token = await getServerToken();
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // 转发到后端（后端会存文件 + 提交 DashScope ASR + 保存 asr_task_id）
    const origBody = new FormData();
    origBody.set("file", new Blob([new Uint8Array(fileBuffer)], { type: file.type }), file.name);
    origBody.set("duration", String(duration));
    const uploadRes = await fetch(`${API_BASE_URL}/api/meetings/${params.id}/audio`, {
      method: "POST",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: origBody,
    });
    const uploadJson = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok || uploadJson.code !== 200) {
      throw new Error(uploadJson.message || "录音上传失败");
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "上传处理失败" }, { status: 500 });
  }
}
