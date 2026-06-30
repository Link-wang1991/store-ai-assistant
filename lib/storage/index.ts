// ============================================================
// 文件存储适配层（lib/storage）。当前实现：Supabase Storage。
// 默认 STORAGE_PROVIDER=none（不保存原文件，只解析入库）。
// - 知识库原件：公开桶 knowledge + public URL（saveOriginal）。
// - 会谈录音：私有桶 meeting-audio，只存 path，不生成永久 public URL（saveMeetingAudio）；
//   提交 ASR 时用短时 signedUrl 拉取。
// 迁移到 OSS/COS 时只需替换本文件。
// ============================================================

import { supabaseAdmin } from "../supabase/admin";

export interface SavedFile {
  url: string | null;
  path: string | null;
  error?: string;
}

const PROVIDER = (process.env.STORAGE_PROVIDER || "none").toLowerCase();
export const KNOWLEDGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "knowledge";
export const MEETING_BUCKET = process.env.MEETING_AUDIO_BUCKET || "meeting-audio";

function isOn() {
  return PROVIDER === "supabase";
}

export const storage = {
  enabled: isOn(),
  KNOWLEDGE_BUCKET,
  MEETING_BUCKET,

  // 知识库原件：公开桶 + public URL
  async saveOriginal(opts: {
    storeId: string;
    fileName: string;
    buffer: Buffer;
    contentType?: string;
  }): Promise<SavedFile> {
    if (!isOn()) return { url: null, path: null };
    const path = `${opts.storeId}/${Date.now()}-${opts.fileName}`;
    const client = supabaseAdmin();
    const { error } = await client.storage.from(KNOWLEDGE_BUCKET).upload(path, opts.buffer, {
      contentType: opts.contentType || "application/octet-stream",
      upsert: false,
    });
    if (error) return { url: null, path: null, error: error.message };
    const { data } = client.storage.from(KNOWLEDGE_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, path };
  },

  // 会谈录音：私有桶，只返回 path（不生成 public URL）
  async saveMeetingAudio(opts: {
    storeId: string;
    fileName: string;
    buffer: Buffer;
    contentType?: string;
  }): Promise<{ path: string | null; error?: string }> {
    if (!isOn()) return { path: null, error: "未开启文件存储（STORAGE_PROVIDER=supabase）" };
    const path = `${opts.storeId}/${Date.now()}-${opts.fileName}`;
    const { error } = await supabaseAdmin().storage.from(MEETING_BUCKET).upload(path, opts.buffer, {
      contentType: opts.contentType || "application/octet-stream",
      upsert: false,
    });
    if (error) return { path: null, error: error.message };
    return { path };
  },

  // 短时签名 URL（给 ASR 拉取私有录音）。默认 2 小时。
  async signedUrl(bucket: string, path: string, expiresInSec = 7200): Promise<string | null> {
    if (!isOn()) return null;
    const { data, error } = await supabaseAdmin().storage.from(bucket).createSignedUrl(path, expiresInSec);
    if (error || !data) return null;
    return data.signedUrl;
  },

  // 删除文件：区分 成功删除 / 文件不存在(幂等成功) / 删除失败
  async remove(bucket: string, path: string | null): Promise<{ ok: boolean; notFound?: boolean; error?: string }> {
    if (!isOn()) return { ok: true, notFound: true };
    if (!path) return { ok: true, notFound: true };
    const { data, error } = await supabaseAdmin().storage.from(bucket).remove([path]);
    if (error) return { ok: false, error: error.message };
    return { ok: true, notFound: !data || data.length === 0 };
  },
};
