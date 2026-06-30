// 第二阶段实测：客户画像融合 + AI建议写回 + 互动留痕
// 用法：npx tsx --env-file=.env.local scripts/test-customer-fusion.ts
// 注意：脚本结束会清理本次创建的测试客户及其互动/记忆/机会，不污染库。
import { db } from "../lib/db";
import { answerQuestion } from "../lib/ai/pipeline";
import { supabaseAdmin } from "../lib/supabase/admin";

// 删除某个测试客户产生的全部数据（无 FK 级联，逐表清理）
async function purgeCustomer(storeId: string, customerId: string) {
  const sb = supabaseAdmin();
  await sb.from("growth_opportunities").delete().eq("store_id", storeId).eq("customer_id", customerId);
  await sb.from("customer_interactions").delete().eq("store_id", storeId).eq("customer_id", customerId);
  await sb.from("memory_items").delete().eq("store_id", storeId).eq("scope", "customer").eq("ref_id", customerId);
  await sb.from("customer_records").delete().eq("store_id", storeId).eq("id", customerId);
}

async function main() {
  const stores = await db.stores.listActive();
  if (!stores.length) throw new Error("没有可用门店");
  const store: any = await db.stores.getById((stores[0] as any).id);

  const emps = (await db.employees.listActiveByStore(store.id)) as any[];
  const emp = emps.find((e) => e.role === "consultant") || emps[0];
  if (!emp) throw new Error("没有可用员工");

  // 1) 创建一个带深化画像的测试客户
  const created = await db.customers.create({
    store_id: store.id,
    name: "测试客户·李姐",
    stage: "intent",
    source: "转介绍",
    assigned_to: emp.id,
    personality: "谨慎理性，喜欢自己研究后再决定",
    spending_power: "中",
    decision_style: "需和老公商量后才拍板",
    communication_pref: "微信文字，少打电话",
    concerns: "怕做了没效果、怕被推销办大卡",
    repurchase_opp: "对补水修复有兴趣，预算有限",
  });
  console.log("✅ 测试客户已建：", created.id);

  // 校验 v5 字段可读
  const readBack: any = await db.customers.getById(created.id, store.id);
  console.log("   画像读回：", {
    decision_style: readBack.decision_style,
    concerns: readBack.concerns,
  });

  // 2) 走完整 AI 链路（带 customerId → 融合画像）
  const session = await db.chat.createSession({
    store_id: store.id,
    employee_id: emp.id,
    role: emp.role,
    title: "画像融合测试",
  });

  const ctx: any = {
    authUserId: "test",
    user: { id: emp.user_id, name: emp.name },
    employee: emp,
    store,
    roleLabels: {},
    baseRole: "consultant",
    permissions: {},
  };

  const question = "这位客户一直说要回去和老公商量，迟迟不定，怎么推进成交？";
  console.log("\n❓ 提问：", question);
  const res = await answerQuestion(ctx, session.id, question, { customerId: created.id });

  console.log("\n===== AI 回答 =====\n");
  console.log(res.answer);
  console.log("\n===================");

  // 3) 验证 AI 建议写回 + 互动留痕
  const after: any = await db.customers.getById(created.id, store.id);
  const inters = (await db.interactions.listByCustomer(created.id, store.id, 10)) as any[];

  console.log("\n📌 写回校验：");
  console.log("  ai_suggestion 是否落库：", after.ai_suggestion ? "✅ 是（" + after.ai_suggestion.length + " 字）" : "❌ 否");
  console.log("  ai_suggested_at：", after.ai_suggested_at || "无");
  console.log("  互动时间线条数：", inters.length, inters.map((i) => i.kind));

  // 4) 命中画像关键词检查
  const hitProfile = /商量|老公|家人|谨慎|理性|没效果|推销|预算/.test(res.answer);
  console.log("\n🎯 回答是否结合了客户画像关键词：", hitProfile ? "✅ 是" : "⚠️ 未明显体现");

  // 5) 长记忆自动沉淀闭环（第三阶段·第 1 项）
  const mems = (await db.memory.listForCustomer(store.id, created.id)) as any[];
  console.log("\n🧠 长记忆沉淀校验：");
  console.log("  memory_items 条数：", mems.length);
  for (const m of mems) {
    console.log(`   · ${m.key} = ${m.value}（conf=${m.confidence ?? "-"}, src=${m.source ?? "-"}）`);
  }
  if (mems.length === 0) {
    console.log("  ⚠️ 未沉淀要点。若 AI_PROVIDER=mock 属正常（抽取被跳过）；配了真实 key 仍为空才需排查。");
  } else {
    console.log("  ✅ 已自动沉淀客户事实（source=ai_extract 即闭环生效）");
  }
  // 标签自动合并检查（concerns 类常被打成"怕推销"等标签）
  console.log("  当前客户标签：", after.tags || []);

  // 6) 增长机会引擎（第三阶段·第 2 项）：AI 旁路自动产出
  const opps = (await db.opportunities.listOpenForCustomer(store.id, created.id)) as any[];
  console.log("\n🌱 增长机会校验：");
  console.log("  open 机会条数：", opps.length);
  for (const o of opps) {
    console.log(`   · [${o.type}] ${o.title}（优先级${o.priority ?? "-"}, due=${o.due_at?.slice(0, 10) ?? "-"}, src=${o.source ?? "-"}）`);
    console.log(`     为什么值得跟：${o.reason ?? "-"}`);
    console.log(`     当前阻碍：${o.blocker ?? "-"}`);
    console.log(`     建议话术：${o.opening ?? "-"}`);
    console.log(`     下一步目标：${o.goal ?? "-"}`);
  }
  if (opps.length === 0) {
    console.log("  ⚠️ 未产出机会。mock 下属正常；真实 key 下若该对话确无明确机会也可能为空。");
  } else {
    console.log("  ✅ 增长机会引擎已生效（作战室「🌱 增长机会」区会展示这些）");
  }

  // 清理本次测试数据（客户 + 互动 + 记忆 + 机会），避免污染库
  await purgeCustomer(store.id, created.id);
  console.log("\n🧹 已清理本次测试客户及其互动/记忆/机会。");
}

main().catch((e) => {
  console.error("❌ 失败：", e.message || e);
  process.exit(1);
});
