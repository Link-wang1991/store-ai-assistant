// 回填存量向量：给已有 knowledge_chunks / growth_playbooks 生成 embedding
// 前置：先在 Supabase 执行 supabase/migration-v8.sql
// 用法：npx tsx --env-file=.env.local scripts/backfill-embeddings.ts
import { db } from "../lib/db";
import { embedConfigured, embedTexts, toVectorLiteral } from "../lib/ai/embedding";

async function backfillChunks() {
  const rows = (await db.knowledge.listChunksMissingEmbedding(2000)) as any[];
  console.log(`\n📚 知识库片段待回填：${rows.length} 条`);
  let ok = 0;
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10);
    const vecs = await embedTexts(batch.map((r) => `${r.title || ""}\n${r.content || ""}`));
    for (let j = 0; j < batch.length; j++) {
      const v = vecs[j];
      if (!v) continue;
      await db.knowledge.setChunkEmbedding(batch[j].id, toVectorLiteral(v));
      ok++;
    }
    console.log(`   进度 ${Math.min(i + 10, rows.length)}/${rows.length}`);
  }
  console.log(`   ✅ 知识库回填成功 ${ok}/${rows.length}`);
}

async function backfillPlaybooks() {
  const rows = (await db.playbooks.listMissingEmbedding(2000)) as any[];
  console.log(`\n🧠 增长方法论待回填：${rows.length} 条`);
  let ok = 0;
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10);
    const texts = batch.map((r) =>
      [r.title, r.module, r.scene, r.customer_psychology, r.strategy, r.scripts]
        .filter(Boolean)
        .join("\n")
    );
    const vecs = await embedTexts(texts);
    for (let j = 0; j < batch.length; j++) {
      const v = vecs[j];
      if (!v) continue;
      await db.playbooks.setEmbedding(batch[j].id, toVectorLiteral(v));
      ok++;
    }
    console.log(`   进度 ${Math.min(i + 10, rows.length)}/${rows.length}`);
  }
  console.log(`   ✅ 方法论回填成功 ${ok}/${rows.length}`);
}

async function main() {
  if (!embedConfigured()) throw new Error("未配置 QWEN_API_KEY，无法生成向量");
  await backfillChunks();
  await backfillPlaybooks();
  console.log("\n🎉 回填完成。现在知识库与方法论检索已走语义召回。");
}

main().catch((e) => {
  console.error("❌ 回填失败：", e.message || e);
  process.exit(1);
});
