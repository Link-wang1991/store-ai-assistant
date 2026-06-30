// V2 经营底座种子：默认角色定义/权限矩阵 + 示例通知/排班/活动/项目
// 用法： node --env-file=.env.local scripts/seed-v2.mjs
// 幂等：角色/权限用 upsert；示例数据仅在对应表为空时插入，不动现有数据。
// 前置：先在 Supabase SQL Editor 执行 supabase/migration-v2.sql

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("❌ 缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const ROLE_NAMES = {
  owner: "老板",
  manager: "店长",
  consultant: "咨询师",
  beautician: "美容师",
  receptionist: "前台",
  operator: "运营",
};
const ROLE_KEYS = Object.keys(ROLE_NAMES);
const MODULES = [
  "workbench", "customers", "followups", "schedules", "campaigns",
  "projects", "knowledge", "risks", "reports", "employees", "permissions",
];
const ALL_ACTIONS = ["view", "create", "edit", "delete", "assign", "review", "export", "handle_risk"];

function permsFor(roleKey, module) {
  if (roleKey === "owner") return { actions: ALL_ACTIONS, data_scope: "all" };
  if (roleKey === "manager") {
    if (module === "permissions") return { actions: ["view"], data_scope: "store" };
    if (module === "employees") return { actions: ["view", "edit"], data_scope: "store" };
    return { actions: ["view", "create", "edit", "assign", "review", "handle_risk"], data_scope: "store" };
  }
  // 普通员工
  if (["employees", "permissions", "reports"].includes(module)) return { actions: [], data_scope: "self" };
  if (module === "workbench") return { actions: ["view"], data_scope: "role" };
  if (["knowledge", "campaigns", "projects"].includes(module)) return { actions: ["view"], data_scope: "store" };
  if (module === "schedules") return { actions: ["view"], data_scope: "self" };
  if (module === "customers")
    return { actions: ["consultant", "receptionist"].includes(roleKey) ? ["view", "create", "edit"] : ["view"], data_scope: "assigned" };
  if (module === "followups")
    return { actions: roleKey === "consultant" ? ["view", "create", "edit"] : ["view"], data_scope: "assigned" };
  if (module === "risks") return { actions: ["view", "create"], data_scope: "self" };
  return { actions: ["view"], data_scope: "self" };
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function main() {
  const { data: stores } = await db.from("stores").select("id").eq("status", "active").limit(1);
  if (!stores?.length) {
    console.error("❌ 没有门店，请先运行 scripts/seed.mjs");
    process.exit(1);
  }
  const storeId = stores[0].id;

  // 清理早期笔误写入的 reception（正确 key 为 receptionist）
  await db.from("role_permissions").delete().eq("store_id", storeId).eq("role_key", "reception");
  await db.from("role_definitions").delete().eq("store_id", storeId).eq("role_key", "reception");

  // 1. 角色定义
  console.log("👥 写入默认角色定义...");
  const defs = ROLE_KEYS.map((k, i) => ({
    store_id: storeId,
    role_key: k,
    display_name: ROLE_NAMES[k],
    base_role: k,
    status: "active",
    sort_order: i,
  }));
  await db.from("role_definitions").upsert(defs, { onConflict: "store_id,role_key" });

  // 2. 权限矩阵
  console.log("🔑 写入默认权限矩阵...");
  const perms = [];
  for (const k of ROLE_KEYS) {
    for (const m of MODULES) {
      const p = permsFor(k, m);
      perms.push({ store_id: storeId, role_key: k, module: m, actions: p.actions, data_scope: p.data_scope });
    }
  }
  await db.from("role_permissions").upsert(perms, { onConflict: "store_id,role_key,module" });

  // 示例自定义角色：皮肤管理师（继承美容师模板，验收用）
  await db.from("role_definitions").upsert(
    [{ store_id: storeId, role_key: "skin_manager", display_name: "皮肤管理师", base_role: "beautician", status: "active", sort_order: 10 }],
    { onConflict: "store_id,role_key" }
  );
  const smPerms = MODULES.map((m) => {
    const p = permsFor("beautician", m);
    return { store_id: storeId, role_key: "skin_manager", module: m, actions: p.actions, data_scope: p.data_scope };
  });
  await db.from("role_permissions").upsert(smPerms, { onConflict: "store_id,role_key,module" });

  // 员工（关联排班）
  const { data: emps } = await db.from("employees").select("id, role, name").eq("store_id", storeId);
  const empList = emps || [];

  // 3. 示例通知（仅空表时）
  const { count: annCount } = await db.from("announcements").select("*", { count: "exact", head: true }).eq("store_id", storeId);
  if (!annCount) {
    console.log("📢 写入示例通知...");
    const now = new Date();
    const tmr = new Date(Date.now() + 86400000);
    await db.from("announcements").insert([
      {
        store_id: storeId,
        title: "7月活动销售培训",
        content: "明天下午3点会议室，全体咨询师、前台参加，讲解7月补水季话术与禁忌表达。",
        announcement_type: "training",
        visible_roles: ["consultant", "receptionist", "manager"],
        priority: 10,
        start_at: now.toISOString(),
        end_at: new Date(Date.now() + 3 * 86400000).toISOString(),
        status: "active",
      },
      {
        store_id: storeId,
        title: "本月主推：补水修复季",
        content: "新客99元体验，老客6次卡2680元送面膜5片。不与会员卡叠加，禁止承诺疗效。",
        announcement_type: "campaign",
        visible_roles: [],
        priority: 5,
        start_at: now.toISOString(),
        status: "active",
      },
    ]);
  }

  // 4. 示例排班（仅空表时，给前几个员工今明两天）
  const { count: schCount } = await db.from("schedules").select("*", { count: "exact", head: true }).eq("store_id", storeId);
  if (!schCount && empList.length) {
    console.log("🗓 写入示例排班...");
    const today = fmtDate(new Date());
    const tomorrow = fmtDate(new Date(Date.now() + 86400000));
    const rows = [];
    empList.slice(0, 6).forEach((e, idx) => {
      const early = idx % 2 === 0;
      for (const d of [today, tomorrow]) {
        rows.push({
          store_id: storeId,
          employee_id: e.id,
          work_date: d,
          shift_label: early ? "早班" : "晚班",
          start_time: early ? "10:00" : "13:00",
          end_time: early ? "17:00" : "20:00",
          status: "active",
        });
      }
    });
    await db.from("schedules").insert(rows);
  }

  // 5. 示例活动（仅空表时）
  const { count: campCount } = await db.from("campaigns").select("*", { count: "exact", head: true }).eq("store_id", storeId);
  if (!campCount) {
    console.log("🎁 写入示例活动...");
    await db.from("campaigns").insert([
      {
        store_id: storeId,
        name: "6月补水修复季",
        period: "6月1日-6月30日",
        main_projects: "深层补水修复",
        price: "新客99元/次，老客6次卡2680元",
        target_customers: "干燥/暗沉/轻敏感肌",
        stackable: false,
        staff_script: "先讲屏障修复价值，再给体验价，不承诺疗效",
        reception_script: "可告知活动价与适用人群，价格细节转咨询师",
        banned_expr: "根治、永久、一定有效、立刻见效",
        status: "active",
      },
    ]);
  }

  // 6. 示例项目（仅空表时）
  const { count: projCount } = await db.from("service_projects").select("*", { count: "exact", head: true }).eq("store_id", storeId);
  if (!projCount) {
    console.log("💆 写入示例项目...");
    await db.from("service_projects").insert([
      { store_id: storeId, name: "深层补水修复", category: "皮肤管理", price: "580元/次，6次卡2980元", duration: "60分钟", efficacy: "改善干燥暗沉、修复屏障", suitable: "换季干燥、熬夜暗沉、轻度敏感", contraindication: "急性过敏期、皮肤破损期", status: "active" },
      { store_id: storeId, name: "光子嫩肤", category: "轻医美", price: "1280元/次，3次卡3280元", duration: "45分钟", efficacy: "提亮肤色、淡化色斑", suitable: "肤色暗沉、有色斑困扰", contraindication: "孕期、光敏性皮肤、近期暴晒", status: "active" },
    ]);
  }

  // 7. 示例客户 + 回访（仅空表时，关联到咨询师）
  const { count: custCount } = await db.from("customer_records").select("*", { count: "exact", head: true }).eq("store_id", storeId);
  if (!custCount) {
    const consultant = empList.find((e) => e.role === "consultant");
    if (consultant) {
      console.log("👤 写入示例客户 + 回访...");
      const custs = [
        { name: "张女士", stage: "intent", phone: "13800000001", source: "美团" },
        { name: "李小姐", stage: "new", source: "小红书" },
        { name: "王姐", stage: "regular", source: "转介绍" },
        { name: "陈女士", stage: "churn_risk", source: "到店" },
      ].map((c) => ({ store_id: storeId, assigned_to: consultant.id, ...c }));
      const { data: inserted } = await db.from("customer_records").insert(custs).select("id, name");
      if (inserted && inserted.length >= 2) {
        await db.from("followups").insert([
          { store_id: storeId, customer_id: inserted[0].id, employee_id: consultant.id, type: "未成交3天", status: "todo", due_at: new Date(Date.now() + 3600000).toISOString(), script: "补水活动二次触达，了解是否还有顾虑" },
          { store_id: storeId, customer_id: inserted[1].id, employee_id: consultant.id, type: "新客24h回访", status: "todo", due_at: new Date(Date.now() + 7200000).toISOString(), script: "了解首次体验感受，邀约下次" },
        ]);
      }
    }
  }

  console.log("\n✅ V2 经营底座初始化完成！");
  console.log("   - 6 个默认角色定义 + 权限矩阵");
  console.log("   - 示例通知 / 排班 / 活动 / 项目");
  console.log("   现在可测试：员工问「明天我几点上班」「今天有什么培训」「这个月有什么活动」。");
}

main().catch((e) => {
  console.error("❌ 失败：", e.message);
  process.exit(1);
});
