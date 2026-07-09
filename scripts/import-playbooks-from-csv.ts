// ============================================================
// 从 CSV 批量导入 / 更新 系统增长方法论 growth_playbooks
// 让你只维护 CSV，不必每次改脚本代码。
//
// 用法：
//   系统级（store_id=null，全门店通用，默认）：
//     npx tsx --env-file=.env.local scripts/import-playbooks-from-csv.ts
//   门店级（仅某门店可见）：
//     npx tsx --env-file=.env.local scripts/import-playbooks-from-csv.ts --store=<storeId>
//   指定其它 CSV 文件：
//     npx tsx --env-file=.env.local scripts/import-playbooks-from-csv.ts --file=docs/templates/xxx.csv
//
// 幂等：按 (scenario_key + store_id) 去重 —— 已存在则更新，不存在则新增。
//       与 seed-playbooks.mjs 不同，本脚本【不清空】历史数据，适合持续增量扩充。
// 注意：CSV 的 source / tags 列为内容管理元信息，growth_playbooks 表无对应列，导入时跳过。
//       导入后需运行 backfill-embeddings.ts 生成向量，否则新方法论无法语义召回。
// ============================================================
import { readFileSync } from "fs";
import path from "path";
import { supabaseAdmin } from "../lib/supabase/admin";

// RFC4180 CSV 解析：支持引号包裹、引号内逗号/换行、双引号转义
function parseCsv(input: string): string[][] {
  const text = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const toArr = (s?: string) =>
  (s || "").split(/[,，]/).map((x) => x.trim()).filter(Boolean);

const nn = (s?: string) => {
  const v = (s || "").trim();
  return v ? v : null;
};

async function main() {
  const args = process.argv.slice(2);
  const storeId = args.find((a) => a.startsWith("--store="))?.split("=")[1] || null;
  const file =
    args.find((a) => a.startsWith("--file="))?.split("=")[1] ||
    "../文档/templates/growth-playbooks-template.csv";

  const csvPath = path.resolve(process.cwd(), file);
  const raw = readFileSync(csvPath, "utf8");
  const rows = parseCsv(raw);
  if (rows.length < 2) throw new Error("CSV 没有数据行");

  const header = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1).filter((r) => r.some((c) => (c || "").trim()));

  console.log(`📥 读取 ${csvPath}`);
  console.log(`   目标：${storeId ? `门店级 store_id=${storeId}` : "系统级 store_id=null（全门店通用）"}`);
  console.log(`   数据行：${dataRows.length}\n`);

  const sb = supabaseAdmin();
  let inserted = 0, updated = 0, skipped = 0;

  for (const r of dataRows) {
    const rec: Record<string, string> = {};
    header.forEach((h, i) => (rec[h] = (r[i] ?? "").trim()));

    if (!rec.scenario_key || !rec.module || !rec.title) {
      console.warn(`   ⚠️ 跳过（缺 scenario_key/module/title）：${rec.scenario_key || "(空)"}`);
      skipped++;
      continue;
    }

    const row: Record<string, any> = {
      store_id: storeId,
      scenario_key: rec.scenario_key,
      module: rec.module,
      title: rec.title,
      scene: nn(rec.scene),
      customer_psychology: nn(rec.customer_psychology),
      common_mistakes: nn(rec.common_mistakes),
      strategy: nn(rec.strategy),
      scripts: nn(rec.scripts),
      follow_up_questions: nn(rec.follow_up_questions),
      next_action: nn(rec.next_action),
      risk_note: nn(rec.risk_note),
      applicable_roles: toArr(rec.applicable_roles),
      applicable_stages: toArr(rec.applicable_stages),
      status: "active",
      embedding: null, // 内容变更后清空向量，强制由 backfill-embeddings 按新内容重新生成
      // 注意：rec.source / rec.tags 为内容管理元信息，表无对应列，故不入库。
    };

    // 按 (scenario_key + store_id) 查重
    let q = sb.from("growth_playbooks").select("id").eq("scenario_key", row.scenario_key);
    q = storeId ? q.eq("store_id", storeId) : q.is("store_id", null);
    const { data: existing } = await q.maybeSingle();

    if (existing) {
      const { error } = await sb.from("growth_playbooks").update(row).eq("id", (existing as any).id);
      if (error) { console.error(`   ❌ 更新失败 ${row.scenario_key}：${error.message}`); skipped++; continue; }
      updated++;
    } else {
      const { error } = await sb.from("growth_playbooks").insert(row);
      if (error) { console.error(`   ❌ 新增失败 ${row.scenario_key}：${error.message}`); skipped++; continue; }
      inserted++;
    }
  }

  console.log(`\n✅ 导入完成：新增 ${inserted}，更新 ${updated}，跳过 ${skipped}`);
  console.log("\n👉 下一步请生成向量，否则新方法论无法被语义检索命中：");
  console.log("   npx tsx --env-file=.env.local scripts/backfill-embeddings.ts");
}

main().catch((e) => {
  console.error("❌ 导入失败：", e.message || e);
  process.exit(1);
});
