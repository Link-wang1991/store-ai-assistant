"use client";

import Link from "next/link";
import { useState } from "react";
import { importCustomers, parseImportTable } from "@/lib/actions";
import { matchEmployeeId, suggestEmployee } from "@/lib/employee-match";
import { buildImportInsight, extractDaysSinceVisit, extractFollowupDays } from "@/lib/import-nlp";

// 标准字段 + 非标准表头识别关键词
const FIELDS: { key: string; label: string; kws: string[] }[] = [
  { key: "name", label: "客户姓名", kws: ["姓名", "顾客", "客户", "客户名称", "会员", "会员名", "昵称", "名字", "name"] },
  { key: "phone", label: "联系方式", kws: ["电话", "手机", "微信", "联系", "号码", "联系方式", "手机号", "tel", "phone", "mobile"] },
  { key: "lastVisit", label: "上次到店", kws: ["最近来店", "到店", "回店", "最后护理", "上次", "最近", "日期", "时间", "成交日期", "服务日期", "护理时间", "最后到店", "天数", "多少天", "距今", "未到店", "未回访"] },
  { key: "project", label: "消费项目", kws: ["项目", "服务", "护理", "卡项", "产品", "套餐", "购买", "成交项目", "消费内容"] },
  { key: "amount", label: "消费金额", kws: ["金额", "消费", "实收", "价格", "客单", "付款", "支付", "充值"] },
  { key: "owner", label: "负责人", kws: ["负责人", "归属", "顾问", "所属", "跟进人", "美容师", "咨询师", "员工", "销售", "店员", "服务人", "归属人"] },
  { key: "focus", label: "跟进重点", kws: ["下一步", "跟进重点", "重点", "跟进计划", "后续动作", "下次跟进", "回访计划", "待办", "行动"] },
  { key: "notes", label: "备注", kws: ["备注", "情况说明", "客户情况", "情况", "沟通", "记录", "需求", "诉求", "问题", "皮肤问题", "客户描述", "回访内容"] },
];

const STEPS = ["上传表格", "确认字段", "清洗预览", "导入结果"];

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const split = (line: string) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  return { headers: split(lines[0]), rows: lines.slice(1).map(split) };
}

function autoMap(headers: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const f of FIELDS) {
    m[f.key] = headers.findIndex((h) => {
      const normalized = h.replace(/\s+/g, "").toLowerCase();
      return f.kws.some((k) => normalized.includes(k.toLowerCase()));
    });
  }
  return m;
}

function StepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => (
        <div key={s} className="flex flex-1 flex-col items-center">
          <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${i <= step ? "bg-[var(--green)] text-white" : "bg-slate-100 text-slate-400"}`}>{i + 1}</div>
          <span className={`mt-1 text-[9px] ${i === step ? "text-[var(--green-dark)]" : "text-slate-400"}`}>{s}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-white p-3 text-center">
      <div className={`text-lg font-semibold ${tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-[var(--green-dark)]" : "text-slate-900"}`}>{value}</div>
      <div className="mt-0.5 text-[10px] text-[var(--muted)]">{label}</div>
    </div>
  );
}

export function ImportWizard({ employees = [] }: { employees?: { id: string; name: string }[] }) {
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [assignedTo, setAssignedTo] = useState<string>(""); // "" = 待分配公海
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseNote, setParseNote] = useState("");
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState("");

  const applyTable = (headers: string[], rows: string[][], note?: string) => {
    if (!headers.length || !rows.length) { setError("没解析到名单内容，请确认文件里是客户名单"); return; }
    setHeaders(headers);
    setDataRows(rows);
    setMapping(autoMap(headers));
    setParseNote(note || "");
    setStep(1);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    setParseNote("");
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (ext === "csv" || ext === "txt") {
      // CSV/txt：前端直接读
      const reader = new FileReader();
      reader.onload = () => {
        const { headers, rows } = parseCSV(String(reader.result || ""));
        if (!headers.length) { setError("没解析到表头，请确认是 CSV 文件"); return; }
        applyTable(headers, rows);
      };
      reader.readAsText(file, "utf-8");
    } else {
      // Excel/Word：上传服务端结构化解析
      setParsing(true);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("filename", file.name);
      const r = await parseImportTable(fd);
      setParsing(false);
      if (!r.ok || !r.data) { setError(r.message || "解析失败"); return; }
      applyTable(r.data.headers, r.data.rows, r.data.note);
    }
    input.value = ""; // 允许重选同名文件
  };

  // 清洗统计预览
  const cleaned = (() => {
    const seen = new Set<string>();
    let valid = 0, dup = 0, incomplete = 0, skipped = 0;
    const ni = mapping.name, pi = mapping.phone;
    for (const row of dataRows) {
      const name = ni >= 0 ? (row[ni] || "").trim() : "";
      const phone = pi >= 0 ? (row[pi] || "").trim() : "";
      if (!name && !phone) { skipped++; continue; }
      const key = (name + "|" + phone).toLowerCase();
      if (seen.has(key)) { dup++; continue; }
      seen.add(key);
      if (!name || !phone) incomplete++;
      valid++;
    }
    return { total: dataRows.length, valid, dup, incomplete, skipped };
  })();

  // 负责人匹配预检：精确匹配 → 自动分配；形近 → 疑似待确认（不静默分错）；完全对不上 → 待处理
  const ownerCheck = (() => {
    const oi = mapping.owner;
    if (oi == null || oi < 0) return { mapped: false, matched: 0, suspects: [] as string[], unmatched: [] as string[] };
    let matched = 0;
    const suspects = new Set<string>();
    const unmatched = new Set<string>();
    for (const row of dataRows) {
      const owner = (row[oi] || "").trim();
      if (!owner) continue;
      if (matchEmployeeId(owner, employees)) { matched++; continue; }
      const sug = suggestEmployee(owner, employees);
      if (sug) suspects.add(`${owner} → 疑似「${sug.name}」`);
      else unmatched.add(owner);
    }
    return { mapped: true, matched, suspects: Array.from(suspects), unmatched: Array.from(unmatched) };
  })();

  const aiQuality = (() => {
    const get = (row: string[], k: string) => {
      const i = mapping[k];
      return i >= 0 ? (row[i] || "").trim() : "";
    };
    let high = 0, medium = 0, review = 0, withEvidence = 0, rawFocus = 0, derived = 0, nextPlan = 0, dataGap = 0;
    const samples: { name: string; segment: string; judge: string; evidence: string; confidence: number; reviewReasons: string[] }[] = [];
    const seen = new Set<string>();
    for (const row of dataRows) {
      const name = get(row, "name");
      const phone = get(row, "phone");
      if (!name && !phone) continue;
      const key = `${name}|${phone}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const notes = get(row, "notes");
      const project = get(row, "project");
      const amount = get(row, "amount");
      const focus = get(row, "focus");
      const lastVisit = get(row, "lastVisit");
      const daysFromColumn = /^(\d{1,4})\s*天?$/.test(lastVisit) ? Number(lastVisit.replace(/\D/g, "")) : null;
      const lastVisitDays = daysFromColumn ?? extractDaysSinceVisit(`${lastVisit} ${notes} ${focus}`);
      const isDeal = !!amount || /成交|老客|复购|续卡|维护卡|年度|回访|复查/.test(`${project} ${notes} ${focus}`);
      const insight = buildImportInsight({ name, phone, notes, project, amount, rawFocus: focus, lastVisitDays, isDeal });
      if (!insight) { review++; continue; }
      if (focus) rawFocus++;
      else derived++;
      if (insight.evidence.length) withEvidence++;
      if (insight.followupDays.length || extractFollowupDays(focus || insight.nextAction).length) nextPlan++;
      if (insight.needsReview) {
        review++;
        if (insight.reviewReasons.length) dataGap++;
      }
      else if (insight.confidence >= 0.85) high++;
      else medium++;
      if (samples.length < 3) {
        samples.push({
          name: name || phone || "未命名客户",
          segment: insight.segment,
          judge: insight.aiJudge,
          evidence: insight.evidence[0] || "原始信息不足，需补充",
          confidence: insight.confidence,
          reviewReasons: insight.reviewReasons,
        });
      }
    }
    const total = high + medium + review;
    const healthScore = Math.round(((high + medium * 0.75 + review * 0.45) / Math.max(1, total)) * 100);
    return { total, high, medium, review, withEvidence, rawFocus, derived, nextPlan, dataGap, healthScore, samples };
  })();

  const doImport = async () => {
    setImporting(true);
    setError("");
    const items = dataRows.map((row) => {
      const get = (k: string) => { const i = mapping[k]; return i >= 0 ? (row[i] || "").trim() : ""; };
      return { name: get("name"), phone: get("phone"), lastVisit: get("lastVisit"), project: get("project"), amount: get("amount"), owner: get("owner"), focus: get("focus"), notes: get("notes") };
    });
    const r = await importCustomers(items, assignedTo || null);
    setImporting(false);
    if (!r.ok) { setError(r.message || "导入失败"); return; }
    setResult(r.stats || null);
    setStep(3);
  };

  return (
    <div className="space-y-4">
      <StepBar step={step} />
      {error && <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}

      {/* 1 上传 */}
      {step === 0 && (
        <section className="space-y-3">
          <label className="block cursor-pointer rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center transition hover:border-[var(--green)]">
            <input
              type="file"
              accept=".csv,.txt,.xlsx,.xls,.docx,.doc,text/csv"
              onChange={onFile}
              disabled={parsing}
              className="hidden"
            />
            <div className="text-3xl text-slate-300">⬆</div>
            <div className="mt-2 text-sm text-slate-600">{parsing ? "正在解析名单…" : "点击选择名单文件"}</div>
            <div className="mt-1 text-[11px] text-[var(--muted)]">支持 CSV / Excel(xlsx,xls) / Word(docx)；表头不需标准，AI 自动识别</div>
          </label>
          <div className="rounded-xl border border-[var(--line)] bg-white p-4">
            <div className="text-xs font-medium text-slate-700">推荐表头（不强制，多列少列都行）</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FIELDS.map((f) => <span key={f.key} className="rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-600">{f.label}</span>)}
            </div>
            <p className="mt-2 text-[11px] text-[var(--faint)]">规则：客户姓名或联系方式至少有一个就导入；缺其一进「待补充」。</p>
          </div>
        </section>
      )}

      {/* 2 确认字段映射 */}
      {step === 1 && (
        <section className="space-y-3">
          <div className="rounded-xl border border-[var(--line)] bg-white p-4">
            <div className="text-sm font-semibold text-slate-800">{fileName} · 识别到 {headers.length} 列、{dataRows.length} 行</div>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">AI 已自动对应，你可以改。只有「客户姓名」或「联系方式」至少一个有值才会导入</p>
            <p className="mt-1 text-[11px] text-[var(--green-dark)]">「上次到店」可填日期（2026-03-15），也可填「已到店天数」（如 45 / 45天），系统会用今天反推出真实到店日期。</p>
            {parseNote && <p className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-600">{parseNote}</p>}
            <div className="mt-3 space-y-2.5">
              {FIELDS.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-2">
                  <span className="w-20 shrink-0 text-xs text-slate-500">{f.label}</span>
                  <select
                    value={mapping[f.key]}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                    className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-[var(--green)]"
                  >
                    <option value={-1}>（忽略）</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-white p-4">
            <div className="text-sm font-semibold text-slate-800">负责人（兜底）</div>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">表格里有「负责人」列时，会按姓名自动分配给对应员工；这里设的是兜底——表格没填、或姓名对不上员工的，才归到这里。留空则进「待分配」。</p>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="mt-2.5 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none focus:border-[var(--green)]"
            >
              <option value="">待分配（进公海，稍后分配）</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(0)} className="rounded-xl border border-[var(--line)] px-4 py-3 text-sm text-slate-600">上一步</button>
            <button onClick={() => setStep(2)} className="flex-1 rounded-xl bg-[var(--green)] py-3 text-sm font-medium text-white">下一步：清洗预览</button>
          </div>
        </section>
      )}

      {/* 3 清洗预览 */}
      {step === 2 && (
        <section className="space-y-3">
          <div className="rounded-xl border border-[var(--line)] bg-white p-4">
            <div className="text-sm font-semibold text-slate-800">清洗去重预览</div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="总行数" value={cleaned.total} />
              <Stat label="将导入" value={cleaned.valid} tone="ok" />
              <Stat label="重复（跳过）" value={cleaned.dup} tone="warn" />
              <Stat label="信息待补充" value={cleaned.incomplete} tone="warn" />
              <Stat label="空行（跳过）" value={cleaned.skipped} />
            </div>
            <p className="mt-2 text-[11px] text-[var(--faint)]">缺姓名或联系方式之一的会保留并标注待补充，不丢弃。</p>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">AI 识别健康预览</div>
                <p className="mt-0.5 text-[11px] text-[var(--muted)]">入库前先检查建议是否有依据、是否需要人工复核。</p>
              </div>
              <div className={`text-2xl font-semibold ${aiQuality.healthScore >= 80 ? "text-[var(--green-dark)]" : "text-amber-600"}`}>
                {aiQuality.healthScore}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="高可信" value={aiQuality.high} tone="ok" />
              <Stat label="中可信" value={aiQuality.medium} />
              <Stat label="需复核" value={aiQuality.review} tone="warn" />
              <Stat label="有依据" value={aiQuality.withEvidence} />
              <Stat label="资料不足" value={aiQuality.dataGap} tone="warn" />
              <Stat label="原表重点" value={aiQuality.rawFocus} />
              <Stat label="AI补全" value={aiQuality.derived} />
            </div>
            {aiQuality.samples.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {aiQuality.samples.map((s, i) => (
                  <div key={`${s.name}-${i}`} className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
                    <span className="font-medium text-slate-800">{s.name}</span>
                    <span className="ml-1 text-[var(--green-dark)]">{s.segment} · {Math.round(s.confidence * 100)}%</span>
                    <div className="mt-0.5 line-clamp-2">判断：{s.judge}</div>
                    <div className="mt-0.5 line-clamp-1 text-slate-400">依据：{s.evidence}</div>
                    {s.reviewReasons.length > 0 && (
                      <div className="mt-0.5 line-clamp-1 text-amber-600">需补：{s.reviewReasons.join("、")}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 负责人匹配预检 */}
          <div className="rounded-xl border border-[var(--line)] bg-white p-4">
            <div className="text-sm font-semibold text-slate-800">负责人分配预检</div>
            {!ownerCheck.mapped ? (
              <p className="mt-1 text-[11px] text-amber-600">
                没识别到「负责人」列。请回上一步把负责人列对应上，否则客户会进「待分配」，需逐个手动分配。
              </p>
            ) : (
              <>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  <span className="text-[var(--green-dark)]">{ownerCheck.matched} 位</span>姓名精确匹配、自动分配
                  {ownerCheck.suspects.length > 0 && <span className="text-amber-600">，{ownerCheck.suspects.length} 个疑似</span>}
                  {ownerCheck.unmatched.length > 0 && <span className="text-amber-600">，{ownerCheck.unmatched.length} 个对不上</span>}
                  。
                </p>
                {ownerCheck.suspects.length > 0 && (
                  <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-700">
                    <div className="font-medium">疑似形近字（不会自动分配，导入后到客户页确认）：</div>
                    <div className="mt-1">{ownerCheck.suspects.join("；")}</div>
                    <div className="mt-1 text-amber-600/80">如只差一个字，系统会先标记为疑似；确认是同一人后再统一员工姓名或在客户页确认分配。</div>
                  </div>
                )}
                {ownerCheck.unmatched.length > 0 && (
                  <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
                    <div>这些负责人在员工列表里找不到：<span className="font-medium">{ownerCheck.unmatched.join("、")}</span></div>
                    <div className="mt-1 text-slate-400">不会被随意分配，先进「待分配」。去员工管理补建同名员工后，用客户页「重新识别」一键归位。</div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="rounded-xl border border-[var(--line)] px-4 py-3 text-sm text-slate-600">上一步</button>
            <button onClick={doImport} disabled={importing || cleaned.valid === 0} className="flex-1 rounded-xl bg-[var(--green)] py-3 text-sm font-medium text-white disabled:opacity-50">
              {importing ? "正在导入…" : `确认导入 ${cleaned.valid} 位客户`}
            </button>
          </div>
        </section>
      )}

      {/* 4 结果 */}
      {step === 3 && result && (
        <section className="space-y-3">
          <div className="rounded-xl border border-[var(--green)]/30 bg-[var(--green-soft)] p-4 text-center">
            <div className="text-sm font-semibold text-[var(--green-dark)]">导入完成</div>
            <p className="mt-0.5 text-[11px] text-[var(--green-dark)]/80">{result.total} 行，新增 {result.imported} 位、更新 {result.updated || 0} 位</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="新增" value={result.imported} tone="ok" />
            <Stat label="更新" value={result.updated || 0} tone="ok" />
            <Stat label="重复跳过" value={result.duplicate} tone="warn" />
            <Stat label="信息待补充" value={result.incomplete} tone="warn" />
            <Stat label="空行跳过" value={result.skipped} />
            <Stat label="AI健康分" value={result.healthScore || 0} tone={(result.healthScore || 0) >= 80 ? "ok" : "warn"} />
            <Stat label="高可信建议" value={result.aiHighConfidence || 0} tone="ok" />
            <Stat label="需人工复核" value={result.aiNeedsReview || 0} tone="warn" />
            <Stat label="资料不足" value={result.dataGapCount || 0} tone="warn" />
            <Stat label="生成提醒" value={result.nextFollowGenerated || 0} />
          </div>
          <p className="rounded-xl border border-[var(--line)] bg-white p-4 text-[11px] text-[var(--muted)]">
            已按最近到店日期自动分池（新客 / 活跃老客 / 沉睡），缺信息的标注了待补充。
            {result.byName > 0 ? ` 其中 ${result.byName} 位按表格「负责人」自动分配给了对应员工。` : ""}
            {result.ownerUnmatched > 0
              ? ` ${result.ownerUnmatched} 位表格里的负责人对不上门店员工（姓名不一致），已归到兜底/待分配，备注里保留了原负责人名，可到客户页手动改。`
              : ""}
          </p>
          <div className="flex gap-2">
            <button onClick={() => { setStep(0); setResult(null); setHeaders([]); setDataRows([]); setFileName(""); }} className="rounded-xl border border-[var(--line)] px-4 py-3 text-sm text-slate-600">再导一批</button>
            <Link href="/customers" className="flex-1 rounded-xl bg-[var(--green)] py-3 text-center text-sm font-medium text-white">完成，去机会池</Link>
          </div>
        </section>
      )}
    </div>
  );
}
