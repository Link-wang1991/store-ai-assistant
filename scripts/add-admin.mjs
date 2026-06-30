// 创建/修复「系统管理员」演示账号（owner 级最高权限）
// 用法： node --env-file=.env.local scripts/add-admin.mjs
// 幂等：可重复运行，不影响其他数据。

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("❌ 缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const EMAIL = "admin@demo.com";
const PW = "demo123456";
const NAME = "系统管理员";

async function main() {
  // 1. 找一个演示门店
  const { data: stores } = await db.from("stores").select("id").eq("status", "active").limit(1);
  if (!stores || stores.length === 0) {
    console.error("❌ 还没有门店，请先运行 scripts/seed.mjs");
    process.exit(1);
  }
  const storeId = stores[0].id;

  // 2. auth 用户
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let au = (list?.users || []).find((u) => u.email === EMAIL);
  if (!au) {
    const { data, error } = await db.auth.admin.createUser({ email: EMAIL, password: PW, email_confirm: true });
    if (error) throw new Error("创建登录账号失败：" + error.message);
    au = data.user;
    console.log("✓ 已创建登录账号");
  } else {
    await db.auth.admin.updateUserById(au.id, { password: PW });
    console.log("✓ 账号已存在，已重置密码");
  }

  // 3. users 表
  let { data: urow } = await db.from("users").select("id").eq("auth_user_id", au.id).maybeSingle();
  if (!urow) {
    const { data } = await db.from("users").insert({ auth_user_id: au.id, name: NAME, email: EMAIL }).select("id").single();
    urow = data;
  }

  // 4. employees 表（owner 级权限）
  const { data: emp } = await db.from("employees").select("id").eq("user_id", urow.id).maybeSingle();
  if (!emp) {
    await db.from("employees").insert({
      store_id: storeId,
      user_id: urow.id,
      name: NAME,
      role: "owner",
      position: "系统管理员",
      status: "active",
    });
    console.log("✓ 已创建管理员员工记录（owner 权限）");
  } else {
    await db.from("employees").update({ status: "active", role: "owner", store_id: storeId }).eq("id", emp.id);
    console.log("✓ 已更新管理员员工记录");
  }

  console.log("\n✅ 管理员就绪： admin@demo.com / demo123456");
  console.log("   登录后右下角「🔀 切换角色」可一键切到任意角色（免重新登录）。");
}

main().catch((e) => {
  console.error("❌ 失败：", e.message);
  process.exit(1);
});
