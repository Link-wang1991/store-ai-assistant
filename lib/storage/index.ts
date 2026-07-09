// ============================================================
// 文件存储适配层（lib/storage）— 仅后端模式
// 文件通过 Spring Boot 后端处理，前端不直接操作存储。
// ============================================================

function notAvail(name: string) {
  return { path: null, url: null, error: `文件存储不可用：后端模式下 ${name} 不可用` };
}

export const storage = {
  MEETING_BUCKET: "meeting-audio" as const,
  KNOWLEDGE_BUCKET: "knowledge" as const,

  isOn: () => false,

  isSupabase: () => false,

  async saveOriginal(opts: { buffer: Buffer; fileName: string; storeId: string; contentType?: string }) {
    return notAvail("saveOriginal");
  },

  async saveMeetingAudio(opts: { buffer: Buffer; fileName: string; storeId: string; contentType?: string }) {
    return notAvail("saveMeetingAudio");
  },

  async remove(_bucket: string, _path: string) {
    return { ok: true };
  },

  async signedUrl(_bucket: string, _path: string, _expiresInSec: number) {
    return null;
  },
};
