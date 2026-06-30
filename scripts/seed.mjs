// 演示数据初始化脚本
// 用法： node --env-file=.env.local scripts/seed.mjs
// 会创建：1 个演示门店 + 6 个角色账号 + 一批示例知识库 + 门店禁用词
// 可重复运行（每次会先清理同名演示数据）

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("❌ 缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  console.error("   请用： node --env-file=.env.local scripts/seed.mjs");
  process.exit(1);
}

const db = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "demo123456";
const BRAND = "演示·星颜美学";
const ACCOUNTS = [
  { email: "owner@demo.com", name: "王老板", role: "owner", position: "门店老板" },
  { email: "manager@demo.com", name: "李店长", role: "manager", position: "店长" },
  { email: "consultant@demo.com", name: "小美", role: "consultant", position: "咨询师" },
  { email: "beautician@demo.com", name: "阿芳", role: "beautician", position: "美容师" },
  { email: "reception@demo.com", name: "小婷", role: "receptionist", position: "前台" },
  { email: "operator@demo.com", name: "阿杰", role: "operator", position: "运营" },
  { email: "admin@demo.com", name: "系统管理员", role: "owner", position: "系统管理员" },
];

const ALL = ["owner", "manager", "consultant", "beautician", "receptionist", "operator"];

const DOCS = [
  {
    title: "品牌介绍",
    category: "品牌介绍",
    visible_roles: ALL,
    content: `星颜美学成立于 2018 年，专注中高端皮肤管理与抗衰养护。

我们的核心优势：进口仪器 + 一对一定制方案 + 持证美容师团队。

门店定位：服务 25-45 岁注重品质的都市女性，主打"安全、专业、有效果可见"。`,
  },
  {
    title: "补水修复项目介绍",
    category: "项目介绍",
    visible_roles: ALL,
    content: `【深层补水修复】针对干燥、暗沉、屏障受损肌肤。

原理：通过导入小分子玻尿酸 + 修复精华，改善肌肤含水量与屏障。

适合人群：换季泛干、熬夜暗沉、轻度敏感肌。建议疗程 6-8 次，每周 1 次。

单次时长约 60 分钟。注意：急性过敏期、皮肤破损期不做。`,
  },
  {
    title: "项目价格表",
    category: "价格表",
    visible_roles: ["owner", "manager", "consultant"],
    content: `深层补水修复：单次 580 元，6 次卡 2980 元。

光子嫩肤：单次 1280 元，3 次卡 3280 元。

会员折扣：年卡会员所有单项 8.5 折。

底价说明：补水卡最低不低于 2680 元，需店长审批。`,
  },
  {
    title: "6月补水修复活动",
    category: "活动方案",
    visible_roles: ALL,
    content: `【6月补水季】新客体验价：深层补水修复 99 元/次（原价 580）。

老客专享：补水 6 次卡 2680 元（赠面膜 5 片）。

规则：体验价每人限 1 次；活动不与会员卡折扣叠加。

时间：6月1日-6月30日。`,
  },
  {
    title: "销售话术-客户嫌贵",
    category: "销售话术",
    visible_roles: ["consultant", "manager"],
    content: `客户说"太贵了"时：

1. 先认同："理解您，护肤确实要选适合自己的。"
2. 转移到价值："咱们的补水是进口仪器+一对一方案，6次下来肌肤含水量能明显改善。"
3. 给方案："您可以先 99 元体验一次，感受效果再决定，您看可以吗？"

注意：不要直接降价，不要承诺"一定有效"。`,
  },
  {
    title: "补水护理标准流程SOP",
    category: "护理流程",
    visible_roles: ["beautician", "manager"],
    content: `服务前：确认客户无急性过敏、无皮肤破损；清洁双手与仪器。

服务中：清洁→爽肤→导入精华→面膜→收尾护理，全程询问客户感受。

服务后：提醒 24 小时内不化浓妆、注意防晒、多补水。

升级提醒：如客户出现明显泛红、刺痛、肿胀，立即停止并升级给店长。`,
  },
  {
    title: "客诉处理流程",
    category: "客诉处理",
    visible_roles: ALL,
    content: `客户投诉处理三步：

1. 倾听+安抚，不争辩："非常抱歉给您带来不好的体验。"
2. 记录问题，不当场承诺赔偿。
3. 升级给店长/老板处理，给客户明确的回复时间。

涉及皮肤异常、退款的，一律升级，不得自行承诺。`,
  },
];

const BANNED = ["根治", "永久", "一次见效", "包好"];

async function cleanup() {
  console.log("🧹 清理旧的演示数据…");
  // 删除 auth 用户
  try {
    const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of data?.users || []) {
      if (ACCOUNTS.some((a) => a.email === u.email)) {
        await db.auth.admin.deleteUser(u.id);
      }
    }
  } catch (e) {
    console.warn("  跳过 auth 清理：", e.message);
  }
  // 删除 users 表记录
  await db.from("users").delete().in("email", ACCOUNTS.map((a) => a.email));
  // 删除门店（级联删除员工、知识库等）
  await db.from("stores").delete().eq("brand_name", BRAND);
}

async function main() {
  await cleanup();

  console.log("🏪 创建门店…");
  const { data: store, error: sErr } = await db
    .from("stores")
    .insert({ name: BRAND, brand_name: BRAND, industry_type: "皮肤管理", status: "active" })
    .select("id")
    .single();
  if (sErr) throw sErr;
  const storeId = store.id;

  console.log("👥 创建账号…");
  let ownerUserId = null;
  for (const a of ACCOUNTS) {
    const { data: au, error: auErr } = await db.auth.admin.createUser({
      email: a.email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (auErr) throw new Error(`创建 ${a.email} 失败: ${auErr.message}`);

    const { data: u } = await db
      .from("users")
      .insert({ auth_user_id: au.user.id, name: a.name, email: a.email })
      .select("id")
      .single();

    await db.from("employees").insert({
      store_id: storeId,
      user_id: u.id,
      name: a.name,
      role: a.role,
      position: a.position,
      status: "active",
    });
    if (a.role === "owner" && !ownerUserId) ownerUserId = u.id;
    console.log(`  ✓ ${a.name}（${a.role}） ${a.email}`);
  }
  await db.from("stores").update({ owner_id: ownerUserId }).eq("id", storeId);

  // owner employee id（作为上传人；可能有多个 owner，取第一个）
  const { data: ownerEmps } = await db
    .from("employees")
    .select("id")
    .eq("store_id", storeId)
    .eq("role", "owner")
    .limit(1);
  const ownerEmp = ownerEmps?.[0];

  console.log("📚 写入示例知识库…");
  for (const doc of DOCS) {
    const { data: d } = await db
      .from("knowledge_documents")
      .insert({
        store_id: storeId,
        title: doc.title,
        category: doc.category,
        file_type: "md",
        visible_roles: doc.visible_roles,
        status: "active",
        uploaded_by: ownerEmp.id,
      })
      .select("id")
      .single();

    const chunks = doc.content
      .split(/\n{2,}/)
      .map((c) => c.trim())
      .filter(Boolean)
      .map((content) => ({
        store_id: storeId,
        document_id: d.id,
        title: doc.title,
        content,
        category: doc.category,
        visible_roles: doc.visible_roles,
        status: "active",
        source: "seed",
      }));
    await db.from("knowledge_chunks").insert(chunks);
    console.log(`  ✓ ${doc.title}（${chunks.length} 片段）`);
  }

  console.log("🚫 写入门店禁用词…");
  await db.from("banned_words").insert(
    BANNED.map((word) => ({ store_id: storeId, word, created_by: ownerEmp.id }))
  );

  console.log("\n✅ 初始化完成！");
  console.log("   登录地址： http://localhost:3000/login");
  console.log("   老板账号： owner@demo.com / demo123456");
  console.log("   咨询师账号： consultant@demo.com / demo123456");
  console.log("   （其余角色见 scripts/seed.mjs，密码均为 demo123456）");
}

main().catch((e) => {
  console.error("❌ 失败：", e.message);
  process.exit(1);
});
