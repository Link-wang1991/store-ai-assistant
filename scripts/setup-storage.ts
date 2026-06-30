// 创建存储桶（幂等）：知识库公开桶 + 会谈录音私有桶。
// 用法：npx tsx --env-file=.env.local scripts/setup-storage.ts
import { supabaseAdmin } from "../lib/supabase/admin";

async function ensureBucket(sb: any, name: string, isPublic: boolean) {
  const { data: list, error: le } = await sb.storage.listBuckets();
  if (le) throw le;
  if (list?.some((b: any) => b.name === name)) {
    console.log(`ℹ️ bucket "${name}" 已存在（${isPublic ? "公开" : "私有"}）`);
    return;
  }
  const { error } = await sb.storage.createBucket(name, { public: isPublic });
  if (error) throw error;
  console.log(`✅ 已创建${isPublic ? "公开" : "私有"} bucket "${name}"`);
}

async function main() {
  const sb = supabaseAdmin();
  const knowledge = process.env.SUPABASE_STORAGE_BUCKET || "knowledge";
  const meeting = process.env.MEETING_AUDIO_BUCKET || "meeting-audio";

  await ensureBucket(sb, knowledge, true); // 知识库原件：公开
  await ensureBucket(sb, meeting, false); // 会谈录音：私有（敏感，不公网裸露）

  console.log("\n👉 接下来：把 .env.local 的 STORAGE_PROVIDER 改成 supabase（若还没改），重启服务。");
  console.log("   会谈录音会存入私有桶，仅在提交转写时用短时签名 URL 拉取，不再生成永久公开链接。");
}
main().catch((e) => { console.error("❌", e.message || e); process.exit(1); });
