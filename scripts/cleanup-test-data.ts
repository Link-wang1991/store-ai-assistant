// 一次性清理：删除库里重复的「测试客户·李姐」及其关联数据，
// 以及 v9 之前 AI 产出的「空字段机会卡」（无 reason/blocker/opening/goal）。
// 用法：npx tsx --env-file=.env.local scripts/cleanup-test-data.ts
import { supabaseAdmin } from "../lib/supabase/admin";

async function main() {
  const sb = supabaseAdmin();

  // 1) 清理所有测试客户及关联数据
  const { data: custs } = await sb
    .from("customer_records")
    .select("id, store_id")
    .eq("name", "测试客户·李姐");
  console.log(`找到测试客户 ${custs?.length || 0} 个`);
  for (const c of (custs || []) as any[]) {
    await sb.from("growth_opportunities").delete().eq("store_id", c.store_id).eq("customer_id", c.id);
    await sb.from("customer_interactions").delete().eq("store_id", c.store_id).eq("customer_id", c.id);
    await sb.from("memory_items").delete().eq("store_id", c.store_id).eq("scope", "customer").eq("ref_id", c.id);
    await sb.from("customer_records").delete().eq("id", c.id);
  }
  console.log("✅ 测试客户及其互动/记忆/机会已清理");

  // 2) 清理旧的空字段机会卡（AI 产出但 4 个业务字段全空）
  const { data: empties } = await sb
    .from("growth_opportunities")
    .select("id")
    .eq("source", "ai_extract")
    .is("reason", null)
    .is("blocker", null)
    .is("opening", null)
    .is("goal", null);
  console.log(`找到旧空字段机会卡 ${empties?.length || 0} 条`);
  if (empties && empties.length) {
    await sb.from("growth_opportunities").delete().in("id", empties.map((e: any) => e.id));
  }
  console.log("✅ 旧空字段机会卡已清理");
  console.log("\n🎉 清理完成。");
}

main().catch((e) => {
  console.error("❌ 清理失败：", e.message || e);
  process.exit(1);
});
