import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { submitTranscription, asrConfigured } from "@/lib/ai/asr";

export const runtime = "nodejs";
export const maxDuration = 300; // 长录音上传到存储可能较久

const MAX_AUDIO_BYTES = 100 * 1024 * 1024; // 录音上限 100MB（约 60 分钟内）

// 上传会谈录音 → 存私有桶 → 用短时签名 URL 提交转写任务
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const meeting: any = await db.meetings.getById(params.id, ctx.store.id);
  if (!meeting) return NextResponse.json({ error: "会谈不存在" }, { status: 404 });
  if (meeting.employee_id !== ctx.employee.id)
    return NextResponse.json({ error: "无权操作该会谈" }, { status: 403 });

  // 客户端重复点击「结束」或网络重试时，不重复创建 audio_files / ASR 任务。
  if (meeting.audio_url && ["transcribing", "analyzing", "done"].includes(meeting.status)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (!asrConfigured())
    return NextResponse.json({ error: "未配置语音转写（QWEN_API_KEY）" }, { status: 400 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const file = form.get("file") as File | null;
  const duration = parseInt((form.get("duration") as string) || "0", 10) || null;
  if (!file || file.size === 0) return NextResponse.json({ error: "没有录音文件" }, { status: 400 });

  // 服务端大小校验
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: "录音文件过大（超过 100MB）。请缩短单次录音（建议 60 分钟内），或分段录制后分别上传。" },
      { status: 413 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = (file.type.split("/")[1] || "webm").split(";")[0];

    // 再查一次，兜住两个上传请求几乎同时进入的情况。
    const latest: any = await db.meetings.getById(params.id, ctx.store.id);
    if (latest?.audio_url && ["transcribing", "analyzing", "done"].includes(latest.status)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    // 存入私有桶，只拿 path（不生成永久 public URL）
    const saved = await storage.saveMeetingAudio({
      storeId: ctx.store.id,
      fileName: `meeting-${params.id}.${ext}`,
      buffer,
      contentType: file.type || "audio/webm",
    });
    if (!saved.path) {
      const msg = saved.error
        ? `录音保存失败：${saved.error}（若文件过大，请在 Supabase 调大存储上限或缩短录音）`
        : "录音保存失败：未开启文件存储（STORAGE_PROVIDER=supabase）";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // audio_files 记录元信息（不存公开 url）
    await db.audioFiles.create({
      store_id: ctx.store.id,
      meeting_id: params.id,
      file_url: null,
      file_path: saved.path,
      file_size: buffer.length,
      duration,
      format: ext,
      upload_status: "uploaded",
      storage_provider: "supabase",
    });

    // 短时签名 URL（2h）给 DashScope ASR 拉取
    const signed = await storage.signedUrl(storage.MEETING_BUCKET, saved.path, 7200);
    if (!signed) {
      await db.meetings.update(params.id, ctx.store.id, { status: "failed" });
      return NextResponse.json({ error: "生成转写授权链接失败，请重试" }, { status: 500 });
    }

    const taskId = await submitTranscription(signed); // 自动识别说话人数量

    // meeting_sessions.audio_url 存内部 path（非公开链接），作为"有录音"标识
    await db.meetings.update(params.id, ctx.store.id, {
      audio_url: saved.path,
      duration,
      ended_at: new Date().toISOString(),
      asr_task_id: taskId,
      status: "transcribing",
      transcript_status: "pending",
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    await db.meetings.update(params.id, ctx.store.id, { status: "failed" }).catch(() => {});
    return NextResponse.json({ error: e.message || "上传失败" }, { status: 500 });
  }
}
