"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext, createAccount } from "./auth";
import { db } from "./db";
import { storage } from "./storage";
import { createSupabaseServer } from "./supabase/server";
import { DEMO_ACCOUNT_TEMPLATES } from "./demo-accounts";
import { PERMISSION_MODULES, KNOWLEDGE_CATEGORIES, isAdminRole } from "./constants";
import { roleLabel } from "./roles";
import { canEnterAdmin, hasPermission } from "./permissions";
import { classifyKnowledge } from "./ai/classify";
import { matchEmployeeId, suggestEmployee } from "./employee-match";
import { buildImportInsight, deriveFollowupFocus, extractDaysSinceVisit, extractFollowupDays, nextFollowFromPlan } from "./import-nlp";
import { parseFileToText, extFromFileName, SUPPORTED_EXTS } from "./knowledge/parse";
import { chunkText } from "./knowledge/chunk";
import { buildAndSaveDailyReport } from "./ai/report";
import { analyzeMeeting } from "./ai/meeting-analysis";
import { embedTexts, toVectorLiteral } from "./ai/embedding";
import { distillStoreExperience } from "./ai/store-memory";
import type { AuthContext } from "./types";

export interface ActionResult {
  ok: boolean;
  message?: string;
  data?: any;
}

// 服务端登录：手机端只请求我们的应用，由 Vercel/本机服务端去连 Supabase。
// 这比浏览器直连 Supabase 更适合移动端和国内网络环境。
export async function loginWithPassword(email: string, password: string): Promise<ActionResult> {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const rawPassword = String(password || "");
  if (!normalizedEmail || !rawPassword) return { ok: false, message: "请输入邮箱和密码" };
  try {
    const supabase = createSupabaseServer();
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: rawPassword,
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message || "登录服务暂时不可用" };
  }
}

// 修复中文文件名乱码：multipart 文件名常被按 latin1 解码（如「老客户」→「è€·å®¢」）。
// 已含中文 = 正常；否则尝试按 latin1 重解码成 utf8，能解出中文才采用。
function fixFilename(name: string): string {
  if (!name) return name;
  if (/[一-鿿]/.test(name)) return name;
  try {
    const decoded = Buffer.from(name, "latin1").toString("utf8");
    if (/[一-鿿]/.test(decoded) && !decoded.includes("�")) return decoded;
  } catch {}
  return name;
}

async function requireAdmin(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("未登录");
  if (!canEnterAdmin(ctx)) throw new Error("无权限");
  return ctx;
}

// ---------------- 知识库 ----------------
export async function uploadKnowledge(formData: FormData): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  if (!hasPermission(ctx, "knowledge", "create"))
    return { ok: false, message: "无知识库上传权限" };

  const file = formData.get("file") as File | null;
  const title = (formData.get("title") as string)?.trim();
  const category = (formData.get("category") as string)?.trim();
  const visibleRoles = formData.getAll("visible_roles").map(String).filter(Boolean);
  const tags = ((formData.get("tags") as string) || "")
    .split(/[,，\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const remark = (formData.get("remark") as string) || null;
  const status = (formData.get("status") as string) || "active";

  if (!file || file.size === 0) return { ok: false, message: "请选择文件" };
  if (file.size > 25 * 1024 * 1024)
    return { ok: false, message: "文件过大（超过 25MB）。请压缩文件，或把内容拆成多个小文档分别上传。" };
  if (!title) return { ok: false, message: "请填写资料标题" };
  if (!category) return { ok: false, message: "请选择资料分类" };
  if (visibleRoles.length === 0) return { ok: false, message: "请选择可见角色" };

  const ext = extFromFileName(file.name);
  if (!SUPPORTED_EXTS.includes(ext))
    return { ok: false, message: `暂不支持 .${ext}，仅支持 ${SUPPORTED_EXTS.join("/")}` };

  let text = "";
  let buf: Buffer;
  try {
    buf = Buffer.from(await file.arrayBuffer());
    text = await parseFileToText(buf, ext, file.name);
  } catch (e: any) {
    return { ok: false, message: "文件解析失败：" + (e.message || ext) };
  }

  const chunks = chunkText(text, title);
  if (chunks.length === 0) return { ok: false, message: "未能从文件中提取到文本内容" };

  // 保存原始文件（storage 适配层，默认 none 时返回 null）
  const saved = await storage.saveOriginal({
    storeId: ctx.store.id,
    fileName: file.name,
    buffer: buf,
    contentType: file.type,
  });

  try {
    const doc = await db.knowledge.createDoc({
      store_id: ctx.store.id,
      title,
      category,
      file_url: saved.url,
      file_type: ext,
      visible_roles: visibleRoles,
      tags,
      status,
      uploaded_by: ctx.employee.id,
      remark,
    });

    // 同步生成语义向量（失败留空，由 backfill 脚本补；不阻断上传）
    const embeds = await embedTexts(chunks.map((c) => `${c.title}\n${c.content}`));
    await db.knowledge.createChunks(
      chunks.map((c, i) => ({
        store_id: ctx.store.id,
        document_id: doc.id,
        title: c.title,
        content: c.content,
        category,
        visible_roles: visibleRoles,
        tags,
        status,
        source: file.name,
        embedding: embeds[i] ? toVectorLiteral(embeds[i] as number[]) : null,
      }))
    );

    revalidatePath("/admin/knowledge");
    return { ok: true, message: `上传成功，生成 ${chunks.length} 个知识片段` };
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
}

// 批量上传：选多个文件 → 逐个解析 + AI 自动分类 + 直接入库 → 返回每个文件的归类结果
// 供前端弹窗展示「AI 判得准不准」，不准的当场用分类下拉改（复用 updateDocCategory）。
export interface BatchUploadItem {
  fileName: string;
  title: string;
  docId: string | null;
  category: string;
  isNew: boolean;
  chunks: number;
  ok: boolean;
  message?: string;
}
export async function batchUploadKnowledge(
  formData: FormData
): Promise<ActionResult & { data?: { results: BatchUploadItem[]; categories: string[] } }> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  if (!hasPermission(ctx, "knowledge", "create"))
    return { ok: false, message: "无知识库上传权限" };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const providedNames = formData.getAll("filename").map(String); // 前端传来的正确 UTF-8 文件名，与 files 一一对应
  const visibleRoles = formData.getAll("visible_roles").map(String).filter(Boolean);
  const status = (formData.get("status") as string) || "active";
  // 指定分类（用户明确知道归哪）时跳过 AI，这批全归到它；为空则走 AI 自动分类
  const fixedCategory = ((formData.get("fixed_category") as string) || "").trim();
  if (files.length === 0) return { ok: false, message: "请选择文件" };
  if (visibleRoles.length === 0) return { ok: false, message: "请选择可见角色" };

  // AI 分类候选：门店自定义分类优先，否则默认分类
  const cfg = (await db.config.listByStore(ctx.store.id).catch(() => [])) as any[];
  const kbCats = cfg.filter((r) => r.category === "knowledge" && r.enabled).map((r) => r.display_name);
  const baseCats: string[] = kbCats.length > 0 ? kbCats : [...KNOWLEDGE_CATEGORIES];

  const results: BatchUploadItem[] = [];
  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx];
    // 文件名优先用前端传来的正确名，否则修复 multipart 可能的乱码
    const realName = (providedNames[idx] || "").trim() || fixFilename(file.name);
    const titleBase = realName.replace(/\.[^.]+$/, "").trim() || realName;
    const item: BatchUploadItem = {
      fileName: realName,
      title: titleBase,
      docId: null,
      category: baseCats[0] || "未分类",
      isNew: false,
      chunks: 0,
      ok: false,
    };
    let createdDocId: string | null = null;
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error("文件过大（超过 25MB）");
      const ext = extFromFileName(file.name);
      if (!SUPPORTED_EXTS.includes(ext)) throw new Error(`暂不支持 .${ext}`);

      const buf = Buffer.from(await file.arrayBuffer());
      const text = await parseFileToText(buf, ext, file.name);
      const chunks = chunkText(text, titleBase);
      if (chunks.length === 0) throw new Error("未能提取到文本内容");

      // 指定分类直接用；否则 AI 自动分类（候选 = baseCats + 本批已新建的分类，让同批同类资料归一处）
      let category: string;
      let isNew: boolean;
      if (fixedCategory) {
        category = fixedCategory;
        isNew = !baseCats.includes(category);
      } else {
        const cls = await classifyKnowledge(titleBase, text, baseCats);
        category = cls.category;
        isNew = cls.isNew;
      }
      if (isNew && !baseCats.includes(category)) baseCats.push(category);

      const saved = await storage.saveOriginal({
        storeId: ctx.store.id,
        fileName: realName,
        buffer: buf,
        contentType: file.type,
      });
      const doc = await db.knowledge.createDoc({
        store_id: ctx.store.id,
        title: titleBase,
        category,
        file_url: saved.url,
        file_type: ext,
        visible_roles: visibleRoles,
        tags: [],
        status,
        uploaded_by: ctx.employee.id,
        remark: null,
      });
      createdDocId = doc.id;
      const embeds = await embedTexts(chunks.map((c) => `${c.title}\n${c.content}`));
      await db.knowledge.createChunks(
        chunks.map((c, i) => ({
          store_id: ctx.store.id,
          document_id: doc.id,
          title: c.title,
          content: c.content,
          category,
          visible_roles: visibleRoles,
          tags: [],
          status,
          source: realName,
          embedding: embeds[i] ? toVectorLiteral(embeds[i] as number[]) : null,
        }))
      );
      item.docId = doc.id;
      item.category = category;
      item.isNew = isNew && !kbCats.includes(category);
      item.chunks = chunks.length;
      item.ok = true;
    } catch (e: any) {
      item.message = e?.message || "处理失败";
      // 回滚：文档已建但片段/向量化失败时，删掉空文档，不留「0 片段」垃圾
      if (createdDocId) {
        try {
          await db.knowledge.deleteDoc(createdDocId, ctx.store.id);
        } catch {}
      }
    }
    results.push(item);
  }

  revalidatePath("/admin/knowledge");
  const okCount = results.filter((r) => r.ok).length;
  return {
    ok: okCount > 0,
    message: `成功 ${okCount}/${results.length} 个文件`,
    data: { results, categories: baseCats },
  };
}

// 手动输入知识（不传文件，直接打字创建）
export async function createManualKnowledge(formData: FormData): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  if (!hasPermission(ctx, "knowledge", "create")) return { ok: false, message: "无知识库创建权限" };

  const title = (formData.get("title") as string)?.trim();
  const category = (formData.get("category") as string)?.trim();
  const content = (formData.get("content") as string)?.trim();
  const visibleRoles = formData.getAll("visible_roles").map(String).filter(Boolean);
  const tags = ((formData.get("tags") as string) || "")
    .split(/[,，\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const remark = (formData.get("remark") as string) || null;
  const status = (formData.get("status") as string) || "active";

  if (!title) return { ok: false, message: "请填写标题" };
  if (!category) return { ok: false, message: "请填写分类" };
  if (!content) return { ok: false, message: "请填写内容" };
  if (visibleRoles.length === 0) return { ok: false, message: "请选择可见角色" };

  const chunks = chunkText(content, title);
  if (chunks.length === 0) return { ok: false, message: "内容为空" };

  try {
    const doc = await db.knowledge.createDoc({
      store_id: ctx.store.id,
      title,
      category,
      file_url: null,
      file_type: "text",
      visible_roles: visibleRoles,
      tags,
      status,
      uploaded_by: ctx.employee.id,
      remark,
    });
    const embeds = await embedTexts(chunks.map((c) => `${c.title}\n${c.content}`));
    await db.knowledge.createChunks(
      chunks.map((c, i) => ({
        store_id: ctx.store.id,
        document_id: doc.id,
        title: c.title,
        content: c.content,
        category,
        visible_roles: visibleRoles,
        tags,
        status,
        source: "手动输入",
        embedding: embeds[i] ? toVectorLiteral(embeds[i] as number[]) : null,
      }))
    );
    revalidatePath("/admin/knowledge");
    return { ok: true, message: `已创建，生成 ${chunks.length} 个知识片段` };
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
}

// 编辑知识库文档的可见角色（上传后修正谁能检索到）
export async function updateKnowledgeRoles(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "knowledge", "edit")) return { ok: false, message: "无知识库编辑权限" };
  const id = formData.get("id") as string;
  const roles = formData.getAll("visible_roles").map(String).filter(Boolean);
  if (!id) return { ok: false, message: "缺少文档ID" };
  if (roles.length === 0) return { ok: false, message: "至少选一个可见角色" };
  const doc = await db.knowledge.getDoc(id);
  if (!doc || doc.store_id !== ctx.store.id) return { ok: false, message: "资料不存在" };
  await db.knowledge.setDocVisibleRoles(id, ctx.store.id, roles);
  revalidatePath(`/admin/knowledge/${id}`);
  revalidatePath("/admin/knowledge");
  return { ok: true, message: "可见角色已更新" };
}

export async function toggleKnowledgeDoc(id: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "knowledge", "edit")) return { ok: false, message: "无知识库编辑权限" };
  const doc = await db.knowledge.getDoc(id);
  if (!doc || doc.store_id !== ctx.store.id) return { ok: false, message: "资料不存在" };
  const next = doc.status === "active" ? "disabled" : "active";
  await db.knowledge.setDocStatus(id, next);
  revalidatePath("/admin/knowledge");
  return { ok: true, message: next === "active" ? "已启用" : "已停用" };
}

export async function deleteKnowledgeDoc(id: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "knowledge", "delete")) return { ok: false, message: "无知识库删除权限" };
  await db.knowledge.deleteDoc(id, ctx.store.id);
  revalidatePath("/admin/knowledge");
  return { ok: true, message: "已删除" };
}

// ---------------- 员工管理 ----------------
export async function createEmployee(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "employees", "create")) return { ok: false, message: "无添加员工权限" };

  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const password = (formData.get("password") as string) || "";
  const phone = (formData.get("phone") as string) || null;
  const role = (formData.get("role") as string) || "consultant";
  const position = (formData.get("position") as string) || null;

  if (!name) return { ok: false, message: "请填写姓名" };
  if (!email) return { ok: false, message: "请填写登录邮箱" };
  if (password.length < 6) return { ok: false, message: "密码至少 6 位" };

  try {
    const { authUserId } = await createAccount(email, password);
    const u = await db.users.create({ auth_user_id: authUserId, name, email, phone });
    await db.employees.create({
      store_id: ctx.store.id,
      user_id: u.id,
      name,
      phone,
      role,
      position,
      status: "active",
    });
    revalidatePath("/admin/employees");
    return { ok: true, message: "员工已添加" };
  } catch (e: any) {
    return { ok: false, message: "添加失败：" + (e.message || "") };
  }
}

export async function toggleEmployee(id: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "employees", "edit")) return { ok: false, message: "无停用/启用员工权限" };
  const emp = await db.employees.getById(id);
  if (!emp || emp.store_id !== ctx.store.id) return { ok: false, message: "员工不存在" };
  if (emp.role === "owner") return { ok: false, message: "不能停用老板账号" };
  const next = emp.status === "active" ? "disabled" : "active";
  await db.employees.setStatus(id, next, next === "disabled" ? new Date().toISOString() : null);
  revalidatePath("/admin/employees");
  return { ok: true, message: next === "active" ? "已启用" : "已停用" };
}

// ---------------- 禁用词 ----------------
export async function addBannedWord(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "knowledge", "edit")) return { ok: false, message: "无知识库维护权限" };
  const word = (formData.get("word") as string)?.trim();
  const reason = (formData.get("reason") as string) || null;
  if (!word) return { ok: false, message: "请输入禁用词" };
  try {
    await db.banned.create({ store_id: ctx.store.id, word, reason, created_by: ctx.employee.id });
  } catch (e: any) {
    return { ok: false, message: (e.message || "").includes("duplicate") ? "该词已存在" : e.message };
  }
  revalidatePath("/admin/knowledge/banned");
  return { ok: true, message: "已添加" };
}

export async function removeBannedWord(id: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "knowledge", "edit")) return { ok: false, message: "无知识库维护权限" };
  await db.banned.delete(id, ctx.store.id);
  revalidatePath("/admin/knowledge/banned");
  return { ok: true };
}

// ---------------- 待确认问题 ----------------
export async function replyPending(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "knowledge", "review")) return { ok: false, message: "无待确认问题处理权限" };
  const id = formData.get("id") as string;
  const reply = (formData.get("reply") as string)?.trim();
  const addToKb = formData.get("add_to_kb") === "on";
  if (!reply) return { ok: false, message: "请填写处理意见" };

  const pq = await db.pending.getById(id, ctx.store.id);
  if (!pq) return { ok: false, message: "记录不存在" };

  await db.pending.update(id, { owner_reply: reply, status: addToKb ? "added" : "replied" });

  if (addToKb) {
    await db.standard.create({
      store_id: ctx.store.id,
      question: pq.question,
      answer: reply,
      category: pq.category,
      created_by: ctx.employee.id,
    });
  }
  revalidatePath("/admin");
  return { ok: true, message: addToKb ? "已回复并加入标准答案" : "已回复" };
}

// ---------------- 知识库缺口 ----------------
export async function resolveGap(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "knowledge", "edit")) return { ok: false, message: "无知识库补充权限" };
  const id = formData.get("id") as string;
  const answer = (formData.get("answer") as string)?.trim();
  const gap = await db.gaps.getById(id, ctx.store.id);
  if (!gap) return { ok: false, message: "记录不存在" };
  if (answer) {
    await db.standard.create({
      store_id: ctx.store.id,
      question: gap.question,
      answer,
      category: gap.category,
      created_by: ctx.employee.id,
    });
    await db.gaps.setStatus(id, "added");
    revalidatePath("/admin/knowledge/gaps");
    return { ok: true, message: "已补充为标准答案" };
  }
  await db.gaps.setStatus(id, "closed");
  revalidatePath("/admin/knowledge/gaps");
  return { ok: true, message: "已关闭" };
}

// ---------------- 风险记录 ----------------
export async function resolveRisk(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "risks", "handle_risk")) return { ok: false, message: "无处理风险权限" };
  const id = formData.get("id") as string;
  const result = (formData.get("result") as string)?.trim();
  if (!result) return { ok: false, message: "请填写处理结果" };
  await db.risks.resolve(id, ctx.store.id, {
    status: "closed",
    handled_by: ctx.employee.id,
    handled_result: result,
  });
  revalidatePath("/admin");
  return { ok: true, message: "已处理" };
}

// ---------------- 任务 ----------------
export async function createTask(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "followups", "assign")) return { ok: false, message: "无分配任务权限" };
  const title = (formData.get("title") as string)?.trim();
  const content = (formData.get("content") as string) || null;
  const task_type = (formData.get("task_type") as string) || null;
  const assigned_to = (formData.get("assigned_to") as string) || null;
  const deadline = (formData.get("deadline") as string) || null;
  if (!title) return { ok: false, message: "请填写任务标题" };
  try {
    await db.tasks.create({
      store_id: ctx.store.id,
      title,
      content,
      task_type,
      assigned_to: assigned_to || null,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      status: "todo",
      created_by: ctx.employee.id,
    });
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath("/admin/tasks");
  return { ok: true, message: "增长动作已创建" };
}

export async function updateTaskStatus(
  id: string,
  status: string,
  feedback?: string
): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  const task = await db.tasks.getById(id);
  if (!task || task.store_id !== ctx.store.id) return { ok: false, message: "任务不存在" };
  const canEditAnyTask =
    hasPermission(ctx, "followups", "edit") || hasPermission(ctx, "followups", "assign");
  if (!canEditAnyTask && task.assigned_to !== ctx.employee.id)
    return { ok: false, message: "无权操作该任务" };

  await db.tasks.update(id, {
    status,
    feedback: feedback ?? undefined,
    completed_at: status === "done" ? new Date().toISOString() : null,
  });
  revalidatePath("/tasks");
  revalidatePath("/admin/tasks");
  return { ok: true, message: "已更新" };
}

// ---------------- 员工提交问题给老板 ----------------
export async function submitQuestion(formData: FormData): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  const question = (formData.get("question") as string)?.trim();
  if (!question) return { ok: false, message: "请填写问题" };
  try {
    await db.pending.create({
      store_id: ctx.store.id,
      employee_id: ctx.employee.id,
      question,
      category: "其他问题",
      risk_level: "L3",
      status: "pending",
    });
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath("/submit");
  return { ok: true, message: "已提交给老板/店长" };
}

// ---------------- 标准答案 ----------------
export async function createStandardAnswer(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "knowledge", "create")) return { ok: false, message: "无标准答案创建权限" };
  const question = (formData.get("question") as string)?.trim();
  const answer = (formData.get("answer") as string)?.trim();
  const category = (formData.get("category") as string) || null;
  if (!question || !answer) return { ok: false, message: "问题和答案都要填写" };
  try {
    await db.standard.create({
      store_id: ctx.store.id,
      question,
      answer,
      category,
      created_by: ctx.employee.id,
    });
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath("/admin/knowledge/standard");
  return { ok: true, message: "已保存标准答案" };
}

// ---------------- 知识库缺口：标记已处理（关闭）----------------
export async function closeGap(id: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "knowledge", "edit")) return { ok: false, message: "无知识库缺口处理权限" };
  const gap = await db.gaps.getById(id, ctx.store.id);
  if (!gap) return { ok: false, message: "记录不存在" };
  await db.gaps.setStatus(id, "closed");
  revalidatePath("/admin/knowledge/gaps");
  return { ok: true, message: "已标记已处理" };
}

// ---------------- 知识库缺口：转为补充任务（可指定负责人/截止）----------------
export async function gapToTask(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "followups", "assign")) return { ok: false, message: "无分配任务权限" };
  const id = formData.get("id") as string;
  const assigned_to = (formData.get("assigned_to") as string) || null;
  const deadline = (formData.get("deadline") as string) || null;

  const gap = await db.gaps.getById(id, ctx.store.id);
  if (!gap) return { ok: false, message: "记录不存在" };
  try {
    await db.tasks.create({
      store_id: ctx.store.id,
      title: "补充知识库：" + gap.question,
      content: gap.ai_temp_answer || "请针对该问题补充门店标准答案到知识库。",
      task_type: "知识库补充",
      assigned_to: assigned_to || null,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      status: "todo",
      created_by: ctx.employee.id,
    });
    await db.gaps.setStatus(id, "added");
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath("/admin/knowledge/gaps");
  revalidatePath("/admin/tasks");
  return { ok: true, message: "已转为知识库补充任务" };
}

// ---------------- 老板日报：聚合今日数据 + AI 生成（走适配层）----------------
export async function generateOwnerDailyReport(): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "reports", "view")) return { ok: false, message: "无日报查看权限" };
  const { text, date } = await buildAndSaveDailyReport(ctx.store);
  revalidatePath("/admin/reports");
  return { ok: true, data: { text, date } };
}

// ---------------- 角色定义（自定义角色名）----------------
export async function createRoleDefinition(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "permissions", "edit")) return { ok: false, message: "无权限管理权限" };
  const role_key = (formData.get("role_key") as string)?.trim();
  const display_name = (formData.get("display_name") as string)?.trim();
  const base_role = (formData.get("base_role") as string) || "consultant";
  const description = (formData.get("description") as string) || null;
  if (!role_key || !display_name) return { ok: false, message: "角色标识和显示名都要填" };
  try {
    await db.roles.createDefinition({
      store_id: ctx.store.id,
      role_key,
      display_name,
      base_role,
      description,
      status: "active",
      sort_order: 99,
    });
  } catch (e: any) {
    return { ok: false, message: (e.message || "").includes("duplicate") ? "该角色标识已存在" : e.message };
  }
  revalidatePath("/admin/roles");
  return { ok: true, message: "角色已新增" };
}

export async function saveRoleDefinition(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "permissions", "edit")) return { ok: false, message: "无权限管理权限" };
  const id = formData.get("id") as string;
  const display_name = (formData.get("display_name") as string)?.trim();
  const status = (formData.get("status") as string) || "active";
  const sort_order = parseInt((formData.get("sort_order") as string) || "0", 10) || 0;
  if (!display_name) return { ok: false, message: "显示名不能为空" };
  await db.roles.updateDefinition(id, ctx.store.id, { display_name, status, sort_order });
  revalidatePath("/admin/roles");
  return { ok: true, message: "已保存" };
}

export async function saveRolePermissions(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "permissions", "edit")) return { ok: false, message: "无权限管理权限" };
  const role_key = formData.get("role_key") as string;
  if (!role_key) return { ok: false, message: "缺少角色" };
  try {
    for (const m of PERMISSION_MODULES) {
      const data_scope = (formData.get(`scope_${m.key}`) as string) || "self";
      const actions = formData.getAll(`act_${m.key}`).map(String);
      await db.roles.upsertPermission({
        store_id: ctx.store.id,
        role_key,
        module: m.key,
        actions,
        data_scope,
      });
    }
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath("/admin/roles");
  return { ok: true, message: "权限已保存" };
}

// ---------------- 通知 / 公告 ----------------
export async function createAnnouncement(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "campaigns", "create")) return { ok: false, message: "无发布通知权限" };
  const title = (formData.get("title") as string)?.trim();
  const content = (formData.get("content") as string) || null;
  const announcement_type = (formData.get("announcement_type") as string) || "general";
  const visible_roles = formData.getAll("visible_roles").map(String).filter(Boolean);
  const target_employee_ids = formData.getAll("target_employee_ids").map(String).filter(Boolean);
  const priority = parseInt((formData.get("priority") as string) || "0", 10) || 0;
  const start_at = (formData.get("start_at") as string) || null;
  const end_at = (formData.get("end_at") as string) || null;
  if (!title) return { ok: false, message: "请填写通知标题" };
  try {
    await db.announcements.create({
      store_id: ctx.store.id,
      title,
      content,
      announcement_type,
      visible_roles,
      target_employee_ids,
      priority,
      start_at: start_at ? new Date(start_at).toISOString() : null,
      end_at: end_at ? new Date(end_at).toISOString() : null,
      status: "active",
      created_by: ctx.employee.id,
    });
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath("/admin/announcements");
  return { ok: true, message: "通知已发布" };
}

export async function toggleAnnouncement(id: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "campaigns", "edit")) return { ok: false, message: "无通知编辑权限" };
  const all = await db.announcements.listAll(ctx.store.id);
  const a = (all as any[]).find((x) => x.id === id);
  if (!a) return { ok: false, message: "通知不存在" };
  const next = a.status === "active" ? "archived" : "active";
  await db.announcements.setStatus(id, ctx.store.id, next);
  revalidatePath("/admin/announcements");
  return { ok: true, message: next === "active" ? "已恢复" : "已下线" };
}

export async function announcementToTask(id: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "followups", "assign")) return { ok: false, message: "无分配任务权限" };
  const all = await db.announcements.listAll(ctx.store.id);
  const a = (all as any[]).find((x) => x.id === id);
  if (!a) return { ok: false, message: "通知不存在" };

  // 确定目标员工：指定员工 > 指定角色的 active 员工 > 全员
  const emps = (await db.employees.listActiveByStore(ctx.store.id)) as any[];
  let targets: any[];
  if (a.target_employee_ids?.length) {
    targets = emps.filter((e) => a.target_employee_ids.includes(e.id));
  } else if (a.visible_roles?.length) {
    targets = emps.filter((e) => a.visible_roles.includes(e.role));
  } else {
    targets = emps; // 全员
  }

  const taskType = a.announcement_type === "training" ? "员工培训" : "活动执行";
  const base = {
    store_id: ctx.store.id,
    title: "执行通知：" + a.title,
    content: a.content || "请落实该通知要求。",
    task_type: taskType,
    status: "todo",
    created_by: ctx.employee.id,
  };
  try {
    if (targets.length === 0) {
      await db.tasks.create(base); // 无目标时兜底一条未分配任务
    } else {
      for (const t of targets) {
        await db.tasks.create({ ...base, assigned_to: t.id });
      }
    }
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath("/admin/tasks");
  return { ok: true, message: `已为 ${targets.length || 1} 人生成执行任务` };
}

// ---------------- 工作台：回访任务 ----------------
export async function createFollowup(formData: FormData): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  const customerName = (formData.get("customer_name") as string)?.trim();
  const phone = (formData.get("phone") as string) || null;
  const type = (formData.get("type") as string) || "未成交跟进";
  const due_at = (formData.get("due_at") as string) || null;
  const note = (formData.get("note") as string) || null;
  if (!customerName) return { ok: false, message: "请填写客户名称" };
  try {
    const cust = await db.customers.create({
      store_id: ctx.store.id,
      name: customerName,
      phone,
      assigned_to: ctx.employee.id,
      stage: "intent",
    });
    await db.followups.create({
      store_id: ctx.store.id,
      customer_id: cust.id,
      employee_id: ctx.employee.id,
      type,
      due_at: due_at ? new Date(due_at).toISOString() : null,
      status: "todo",
      script: note,
    });
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath("/work");
  return { ok: true, message: "已创建回访任务" };
}

export async function updateFollowupStatus(id: string, status: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  await db.followups.update(id, ctx.store.id, { status });
  revalidatePath("/work");
  return { ok: true, message: "已更新" };
}

// 档案里设置「下次跟进时间」时，同步一条 followup 增长机会，
// 让作战室也能看到（消除「档案定了跟进但作战室看不到」的孤岛）。
async function syncFollowupOpportunity(
  ctx: AuthContext,
  customerId: string,
  customerName: string,
  nextFollowIso: string | null
) {
  if (!nextFollowIso) return;
  try {
    await db.opportunities.upsertOpen({
      store_id: ctx.store.id,
      customer_id: customerId,
      employee_id: ctx.employee.id,
      type: "followup",
      title: `跟进：${customerName}`,
      priority: 1,
      due_at: nextFollowIso,
      source: "manual",
    });
  } catch {
    // 机会同步失败不影响主操作
  }
}

// ---------------- 增长机会：完成 / 忽略 ----------------
export async function completeOpportunity(id: string, status: "done" | "dismissed" = "done"): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  // 完成（达成/成交）时：先取机会详情，更新状态，再旁路提炼门店级经验（store memory）
  if (status === "done") {
    const opp = await db.opportunities.getById(id, ctx.store.id);
    await db.opportunities.update(id, ctx.store.id, { status });
    await distillStoreExperience(ctx, opp);
  } else {
    await db.opportunities.update(id, ctx.store.id, { status });
  }
  revalidatePath("/admin");
  revalidatePath("/admin/customers");
  revalidatePath("/work");
  return { ok: true, message: status === "done" ? "已标记完成" : "已忽略" };
}

// ---------------- 会谈复盘：删除录音 / 删除会谈（合规）----------------
async function canManageMeeting(ctx: AuthContext, meetingId: string) {
  const m: any = await db.meetings.getById(meetingId, ctx.store.id);
  if (!m) return { ok: false as const, message: "会谈不存在" };
  const isMgr = ["owner", "manager"].includes(ctx.baseRole);
  if (m.employee_id !== ctx.employee.id && !isMgr) return { ok: false as const, message: "无权操作该会谈" };
  return { ok: true as const, meeting: m };
}

export async function deleteMeetingRecording(id: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  const chk = await canManageMeeting(ctx, id);
  if (!chk.ok) return { ok: false, message: chk.message };
  const files = (await db.audioFiles.listByMeeting(id, ctx.store.id)) as any[];
  for (const f of files) {
    if (!f.file_path) continue;
    const r = await storage.remove(storage.MEETING_BUCKET, f.file_path);
    if (!r.ok) return { ok: false, message: "录音文件删除失败，请稍后重试或联系管理员" };
  }
  // storage 全部确认删除（或文件本已不存在）后，再更新数据库
  await db.audioFiles.markDeleted(id, ctx.store.id);
  await db.meetings.update(id, ctx.store.id, { audio_url: null });
  await db.meetingAccessLogs.log({ store_id: ctx.store.id, meeting_id: id, employee_id: ctx.employee.id, action: "delete_audio" });
  revalidatePath(`/meeting/${id}`);
  revalidatePath("/admin/meetings");
  return { ok: true, message: "录音已删除（复盘报告保留）" };
}

export async function deleteMeeting(id: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  const chk = await canManageMeeting(ctx, id);
  if (!chk.ok) return { ok: false, message: chk.message };
  const files = (await db.audioFiles.listByMeeting(id, ctx.store.id)) as any[];
  for (const f of files) {
    if (!f.file_path) continue;
    const r = await storage.remove(storage.MEETING_BUCKET, f.file_path);
    if (!r.ok) return { ok: false, message: "录音文件删除失败，请稍后重试或联系管理员" };
  }
  // 先写审计日志，再删会谈；FK on delete set null 保证审计日志保留（meeting_id 置空）
  await db.meetingAccessLogs.log({ store_id: ctx.store.id, meeting_id: id, employee_id: ctx.employee.id, action: "delete_meeting" });
  await db.meetings.delete(id, ctx.store.id);
  revalidatePath("/meeting");
  revalidatePath("/admin/meetings");
  return { ok: true, message: "会谈已删除" };
}

// ---------------- 历史提醒：删除（老板/店长清理）----------------
export async function deleteAnnouncement(id: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "campaigns", "edit")) return { ok: false, message: "无通知管理权限" };
  await db.announcements.delete(id, ctx.store.id);
  revalidatePath("/admin/announcements");
  return { ok: true, message: "已删除" };
}

export async function deleteRisk(id: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "risks", "handle_risk")) return { ok: false, message: "无风险处理权限" };
  await db.risks.delete(id, ctx.store.id);
  revalidatePath("/admin/risks");
  revalidatePath("/admin");
  return { ok: true, message: "已删除" };
}

export async function deletePendingQuestion(id: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "knowledge", "review")) return { ok: false, message: "无待确认处理权限" };
  await db.pending.delete(id, ctx.store.id);
  revalidatePath("/admin/pending");
  revalidatePath("/admin");
  return { ok: true, message: "已删除" };
}

export async function deleteGap(id: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx, "knowledge", "edit")) return { ok: false, message: "无知识库编辑权限" };
  await db.gaps.delete(id, ctx.store.id);
  revalidatePath("/admin/knowledge/gaps");
  revalidatePath("/admin");
  return { ok: true, message: "已删除" };
}

export async function deleteOpportunityRecord(id: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  await db.opportunities.delete(id, ctx.store.id);
  revalidatePath("/admin");
  revalidatePath("/admin/customers");
  return { ok: true, message: "已删除" };
}

// ---------------- 客户经营：深化画像 ----------------
export async function updateCustomer(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return { ok: false, message: "缺少客户ID" };
  const cust = await db.customers.getById(id, ctx.store.id);
  if (!cust) return { ok: false, message: "客户不存在" };

  const str = (k: string) => {
    const v = (formData.get(k) as string)?.trim();
    return v ? v : null;
  };
  const tagsRaw = ((formData.get("tags") as string) || "")
    .split(/[,，\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const nextFollow = (formData.get("next_follow_at") as string) || "";

  const patch: Record<string, any> = {
    name: str("name") || cust.name,
    phone: str("phone"),
    source: str("source"),
    stage: (formData.get("stage") as string) || cust.stage,
    personality: str("personality"),
    spending_power: str("spending_power"),
    decision_style: str("decision_style"),
    communication_pref: str("communication_pref"),
    concerns: str("concerns"),
    repurchase_opp: str("repurchase_opp"),
    notes: str("notes"),
    tags: tagsRaw,
    next_follow_at: nextFollow ? new Date(nextFollow).toISOString() : null,
  };
  // A2：首次变成"已成交" → 记录成交时间，进「新成交」池
  if (patch.stage === "deal" && cust.stage !== "deal") patch.last_deal_at = new Date().toISOString();
  try {
    await db.customers.update(id, ctx.store.id, patch);
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  await syncFollowupOpportunity(ctx, id, patch.name, patch.next_follow_at);
  revalidatePath(`/admin/customers/${id}`);
  revalidatePath("/admin/customers");
  revalidatePath("/admin");
  return { ok: true, message: "客户画像已更新" };
}

// ---------------- 客户经营：手动记录一次互动（跟进结果）----------------
export async function addInteraction(formData: FormData): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  const customerId = formData.get("customer_id") as string;
  const summary = (formData.get("summary") as string)?.trim();
  const kind = (formData.get("kind") as string) || "note";
  const channel = (formData.get("channel") as string) || null;
  const nextFollow = (formData.get("next_follow_at") as string) || "";
  if (!customerId) return { ok: false, message: "缺少客户ID" };
  if (!summary) return { ok: false, message: "请填写互动内容" };
  const cust = await db.customers.getById(customerId, ctx.store.id);
  if (!cust) return { ok: false, message: "客户不存在" };

  const KIND_TITLE: Record<string, string> = {
    note: "跟进记录", visit: "到店", call: "电话沟通", wechat: "微信沟通", feedback: "客户反馈",
  };
  const now = new Date().toISOString();
  try {
    await db.interactions.create({
      store_id: ctx.store.id,
      customer_id: customerId,
      employee_id: ctx.employee.id,
      kind,
      channel,
      title: KIND_TITLE[kind] || "互动",
      summary,
    });
    const patch: Record<string, any> = { last_contact_at: now };
    if (nextFollow) patch.next_follow_at = new Date(nextFollow).toISOString();
    if (kind === "visit") patch.last_visit_at = now; // A2：记录到店 → 进「今日到店」池
    await db.customers.update(customerId, ctx.store.id, patch);
    await syncFollowupOpportunity(ctx, customerId, cust.name, patch.next_follow_at || null);
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/admin");
  return { ok: true, message: "已记录互动" };
}

// 员工复核 AI 客户画像记忆：accurate=确认可信 / inaccurate=删除 / append=人工补充修正
export async function reviewMemory(
  customerId: string,
  key: string,
  op: "accurate" | "inaccurate" | "append",
  text?: string
): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  const cust = await db.customers.getById(customerId, ctx.store.id);
  if (!cust) return { ok: false, message: "客户不存在" };
  try {
    if (op === "accurate") {
      await db.memory.setConfidence(ctx.store.id, customerId, key, 1);
    } else if (op === "inaccurate") {
      await db.memory.remove(ctx.store.id, customerId, key);
    } else if (op === "append") {
      const v = (text || "").trim();
      if (!v) return { ok: false, message: "请填写补充内容" };
      await db.memory.upsert({
        store_id: ctx.store.id,
        scope: "customer",
        ref_id: customerId,
        key,
        value: v,
        confidence: 1,
        source: "manual",
      });
    }
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath(`/customers/${customerId}`);
  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: true, message: "已更新" };
}

// 删除客户档案（管理员）：用于清理测试/脏数据。关联表 on delete set null，会谈记录保留但解除关联。
export async function deleteCustomer(customerId: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  if (!canEnterAdmin(ctx)) return { ok: false, message: "无权限删除客户" };
  const cust = await db.customers.getById(customerId, ctx.store.id);
  if (!cust) return { ok: false, message: "客户不存在" };
  try {
    await db.customers.delete(customerId, ctx.store.id);
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath("/customers");
  revalidatePath("/admin/customers");
  return { ok: true, message: "已删除客户" };
}

// 客户导入·解析 Excel/docx 名单：上传文件→返回 { headers, rows } 结构化表格，供前端字段映射。
// CSV 前端能自己解析；xlsx/xls/docx 是二进制，交给服务端解析。
export async function parseImportTable(
  formData: FormData
): Promise<ActionResult & { data?: { headers: string[]; rows: string[][]; note?: string } }> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  if (!canEnterAdmin(ctx)) return { ok: false, message: "无权限导入" };
  const file = formData.get("file") as File | null;
  const name = ((formData.get("filename") as string) || "").trim() || (file ? fixFilename(file.name) : "");
  if (!file || file.size === 0) return { ok: false, message: "请选择文件" };
  if (file.size > 25 * 1024 * 1024) return { ok: false, message: "文件过大（超过 25MB）" };
  const ext = extFromFileName(name);
  if (!["csv", "txt", "xlsx", "xls", "docx", "doc"].includes(ext))
    return { ok: false, message: `名单暂只支持 CSV / Excel / Word，当前是 .${ext}` };
  try {
    const { parseTable } = await import("./knowledge/parse-table");
    const buf = Buffer.from(await file.arrayBuffer());
    const { headers, rows, note } = await parseTable(buf, name);
    if (!headers.length || rows.length === 0)
      return { ok: false, message: "没从文件里解析到客户名单，请确认内容是表格/名单" };
    return { ok: true, data: { headers, rows, note } };
  } catch (e: any) {
    return { ok: false, message: "解析失败：" + (e.message || ext) };
  }
}

// 客户批量导入（C1）：接收前端解析+映射好的行，去重清洗后真实入库
export async function importCustomers(
  items: { name?: string; phone?: string; lastVisit?: string; project?: string; amount?: string; notes?: string; owner?: string; focus?: string }[],
  assignedTo?: string | null
): Promise<ActionResult & { stats?: Record<string, number> }> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  if (!canEnterAdmin(ctx)) return { ok: false, message: "无权限导入" };

  const emps = (await db.employees.listByStore(ctx.store.id)) as any[];
  // 统一兜底负责人：表格没「负责人」列、或列里的人对不上员工时用这个；为空则进公海
  const fallbackOwner: string | null = assignedTo && emps.some((e) => e.id === assignedTo) ? assignedTo : null;
  // 表格「负责人」列 → 智能匹配到员工（容忍「小美（咨询师）」这类带括号/后缀写法）
  const activeEmps = emps.filter((e) => e.status !== "disabled").map((e) => ({ id: e.id as string, name: String(e.name) }));

  // 库里已有客户（同名+同号）建索引：重新导入时「更新」而不是「跳过」，让你能补负责人/到店等
  const existing = (await db.customers.listByStore(ctx.store.id)) as any[];
  const existMap = new Map<string, any>();
  for (const c of existing) {
    existMap.set((String(c.name || "").trim() + "|" + String(c.phone || "").trim()).toLowerCase(), c);
  }

  const seenBatch = new Set<string>();
  const toInsert: Record<string, any>[] = [];
  const toUpdate: { id: string; patch: Record<string, any> }[] = [];
  let skipped = 0, duplicate = 0, incomplete = 0, byName = 0, ownerUnmatched = 0, updated = 0;
  let aiHighConfidence = 0, aiMediumConfidence = 0, aiNeedsReview = 0, withEvidence = 0;
  let rawFocusCount = 0, derivedInsightCount = 0, nextFollowGenerated = 0, dataGapCount = 0;

  for (const r of items || []) {
    const name = (r.name || "").trim();
    const phone = (r.phone || "").trim();
    if (!name && !phone) { skipped++; continue; } // 姓名或联系方式至少有一个
    const key = (name + "|" + phone).toLowerCase();
    if (seenBatch.has(key)) { duplicate++; continue; } // 本批文件内的重复
    seenBatch.add(key);
    if (!name || !phone) incomplete++;
    // ---- 跟进重点 + 阶段 ----
    const rawFocus = (r.focus || "").trim();
    if (rawFocus) rawFocusCount++;
    const nowIso = new Date().toISOString();
    const blob = `${r.project || ""} ${r.amount || ""} ${r.notes || ""} ${rawFocus}`;
    const isDeal = !!(r.amount && r.amount.trim()) || /成交|老客|复购|续卡|维护卡|年度|回访|复查/.test(blob);
    // 有金额/项目说明这是成交客户，但只有明确跟进重点时才把导入日当作「新成交日」。
    // 历史老客名单里的消费金额不能让 100 个老客都进入「新成交」池。
    const dealAt = isDeal && rawFocus ? nowIso : null;

    // ---- 负责人：精确匹配才分配；写了但对不上 → 不静默分配，标记疑似/待确认 ----
    const ownerName = (r.owner || "").trim();
    let rowOwner: string | null = null;
    let ownerStatus = "none"; // none(没写) / matched / suspect(形近疑似) / unmatched(完全对不上)
    let suspectName: string | null = null;
    if (ownerName) {
      const hit = matchEmployeeId(ownerName, activeEmps);
      if (hit) { rowOwner = hit; byName++; ownerStatus = "matched"; }
      else {
        ownerUnmatched++;
        const sug = suggestEmployee(ownerName, activeEmps);
        if (sug) { ownerStatus = "suspect"; suspectName = sug.name; }
        else ownerStatus = "unmatched";
      }
    }
    // 表格写了负责人但对不上 → 不分配（进待确认）；表格没写 → 才用兜底负责人
    const assigned = rowOwner || (ownerName ? null : fallbackOwner);

    // ---- 上次到店：① 列里日期/天数；② 列没有时，从情况说明/跟进重点的自然语言解析（「45天未到店」等）----
    let lastVisit: string | null = null;
    if (r.lastVisit) {
      const raw = r.lastVisit.trim();
      const dayHit = raw.match(/^(\d+)\s*天$/) || raw.match(/^(\d{1,3})$/);
      const days = dayHit ? parseInt(dayHit[1], 10) : NaN;
      if (!isNaN(days) && days >= 0 && days < 3650) lastVisit = new Date(Date.now() - days * 86400000).toISOString();
      else { const d = new Date(raw.replace(/[./]/g, "-")); if (!isNaN(d.getTime())) lastVisit = d.toISOString(); }
    }
    let nlpVisitDays: number | null = null;
    if (!lastVisit) {
      const nlpDays = extractDaysSinceVisit(`${r.notes || ""} ${rawFocus}`);
      if (nlpDays != null) {
        nlpVisitDays = nlpDays;
        lastVisit = new Date(Date.now() - nlpDays * 86400000).toISOString();
      }
    }
    const lastVisitDays = nlpVisitDays ?? (lastVisit ? Math.max(0, Math.floor((Date.now() - new Date(lastVisit).getTime()) / 86400000)) : null);

    const insight = buildImportInsight({
      name,
      phone,
      notes: r.notes,
      project: r.project,
      amount: r.amount,
      rawFocus,
      lastVisitDays,
      isDeal,
    });
    const derivedFocus = !rawFocus ? deriveFollowupFocus(r.notes, r.project) : null;
    const focus = rawFocus || insight?.aiJudge || derivedFocus || "";
    if (insight && !rawFocus) derivedInsightCount++;
    if (insight?.evidence?.length) withEvidence++;
    if (insight?.needsReview) {
      aiNeedsReview++;
      if (insight.reviewReasons?.length) dataGapCount++;
    }
    else if ((insight?.confidence || 0) >= 0.85) aiHighConfidence++;
    else if (insight) aiMediumConfidence++;

    // ---- 下一步跟进：从跟进重点的「第N天/前N天」算出下次跟进时间（成交日 + 第N天）----
    const planDays = extractFollowupDays(rawFocus || insight?.nextAction || focus);
    const nextFollow = nextFollowFromPlan(dealAt, planDays.length ? planDays : (insight?.followupDays || []));
    if (nextFollow) nextFollowGenerated++;

    // ---- 备注 + 原始行存档（漏字段也不丢源数据，可一键重新整理）----
    const noteParts = [
      r.project ? `项目：${r.project.trim()}` : "",
      r.amount ? `消费：${r.amount.trim()}` : "",
      ownerName && !rowOwner ? `表格负责人：${ownerName}（${ownerStatus === "suspect" ? `疑似「${suspectName}」待确认` : "未匹配到员工"}）` : "",
      (r.notes || "").trim(),
    ].filter(Boolean);
    const notes = noteParts.join(" · ") || null;
    const importRaw = {
      name,
      phone,
      lastVisit: r.lastVisit || "",
      project: r.project || "",
      amount: r.amount || "",
      owner: ownerName,
      focus: rawFocus,
      notes: r.notes || "",
      insight,
      quality: insight ? {
        confidence: insight.confidence,
        needsReview: insight.needsReview,
        evidenceCount: insight.evidence.length,
        source: insight.source,
        version: insight.version,
        dataCompleteness: insight.dataCompleteness,
        reviewReasons: insight.reviewReasons,
      } : null,
    };
    const exist = existMap.get(key);
    if (exist) {
      const patch: Record<string, any> = {};
      // 负责人：仅精确匹配可覆盖；没写负责人时兜底补空位；疑似/对不上 → 不动 assigned_to（待确认）
      if (rowOwner && rowOwner !== exist.assigned_to) patch.assigned_to = rowOwner;
      else if (!ownerName && !exist.assigned_to && fallbackOwner) patch.assigned_to = fallbackOwner;
      if (lastVisit && lastVisit !== exist.last_visit_at) patch.last_visit_at = lastVisit;
      if (nextFollow && !exist.next_follow_at) patch.next_follow_at = nextFollow;
      if (notes && !exist.notes) patch.notes = notes;
      if (ownerName && ownerName !== exist.import_owner_name) patch.import_owner_name = ownerName;
      if (ownerStatus !== "none" && ownerStatus !== exist.owner_match_status) patch.owner_match_status = ownerStatus;
      patch.import_raw = importRaw;
      if (focus && focus !== exist.ai_suggestion) { patch.ai_suggestion = focus; patch.ai_suggested_at = nowIso; }
      if (isDeal && (exist.stage === "new" || exist.stage === "intent")) patch.stage = "deal";
      if (dealAt && !exist.last_deal_at) patch.last_deal_at = dealAt;
      toUpdate.push({ id: exist.id, patch }); updated++;
      continue;
    }
    toInsert.push({
      store_id: ctx.store.id,
      name: name || "（待补充姓名）",
      phone: phone || null,
      source: "批量导入",
      stage: isDeal ? "deal" : "new",
      assigned_to: assigned,
      import_owner_name: ownerName || null,
      owner_match_status: ownerStatus === "none" ? null : ownerStatus,
      import_raw: importRaw,
      tags: insight?.tags || [],
      ai_suggestion: focus || null,
      ai_suggested_at: focus ? nowIso : null,
      next_follow_at: nextFollow,
      notes,
      last_visit_at: lastVisit,
      last_deal_at: dealAt,
    });
  }

  if (!toInsert.length && !toUpdate.length) {
    return { ok: false, message: "这批客户都已在库中（同名同号），且没有要更新的信息，无需重复导入" };
  }
  try {
    if (toInsert.length) await db.customers.createMany(toInsert);
    for (const u of toUpdate) await db.customers.update(u.id, ctx.store.id, u.patch);
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath("/customers");
  revalidatePath("/admin/customers");
  const insightTotal = aiHighConfidence + aiMediumConfidence + aiNeedsReview;
  const healthScore = Math.round(
    ((aiHighConfidence + aiMediumConfidence * 0.75 + aiNeedsReview * 0.45) / Math.max(1, insightTotal)) * 100
  );
  return {
    ok: true,
    message: `新增 ${toInsert.length} 位，更新 ${updated} 位`,
    stats: {
      total: (items || []).length,
      imported: toInsert.length,
      updated,
      duplicate,
      incomplete,
      skipped,
      byName,
      ownerUnmatched,
      rawFocus: rawFocusCount,
      derivedInsight: derivedInsightCount,
      withEvidence,
      aiHighConfidence,
      aiMediumConfidence,
      aiNeedsReview,
      dataGapCount,
      nextFollowGenerated,
      healthScore,
    },
  };
}

// 重新分析会谈（用最新 prompt 重跑复盘，验证/刷新分析质量）
export async function reanalyzeMeeting(meetingId: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  const m = await db.meetings.getById(meetingId, ctx.store.id);
  if (!m) return { ok: false, message: "会谈不存在" };
  const isMgr = ["owner", "manager"].includes(ctx.baseRole);
  if (m.employee_id !== ctx.employee.id && !isMgr) return { ok: false, message: "无权限" };
  try {
    await db.meetings.update(meetingId, ctx.store.id, { analysis_status: "analyzing" });
    await analyzeMeeting(ctx, meetingId);
  } catch (e: any) {
    await db.meetings.update(meetingId, ctx.store.id, { analysis_status: "failed" }).catch(() => {});
    return { ok: false, message: e.message || "重新分析失败" };
  }
  revalidatePath(`/meeting/${meetingId}`);
  return { ok: true, message: "已重新分析" };
}

// 首页快速归档风险（标记已处理；仍可在「风险记录 · 已处理」里检索到）
export async function archiveRisk(id: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  if (!canEnterAdmin(ctx)) return { ok: false, message: "无权限" };
  try {
    await db.risks.resolve(id, ctx.store.id, { status: "handled", handled_result: "首页快速归档" });
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath("/admin");
  revalidatePath("/admin/risks");
  return { ok: true, message: "已归档" };
}

// 清空门店所有客户与经营测试数据（仅老板）：客户/会谈/机会/提问/风险/跟进全删，
// 保留账号、知识库、方法论库、自定义配置。用于演示→真实测试的彻底重置。
export async function clearDemoData(): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  if (ctx.baseRole !== "owner") return { ok: false, message: "仅老板可清空数据" };
  try {
    await db.maintenance.clearStoreData(ctx.store.id);
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  for (const p of ["/admin", "/customers", "/work", "/me", "/meeting"]) revalidatePath(p);
  return { ok: true, message: "已清空所有客户与经营测试数据" };
}

// 改门店名称（仅老板）
export async function updateStoreInfo(formData: FormData): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  if (ctx.baseRole !== "owner") return { ok: false, message: "仅老板可改门店信息" };
  const name = (formData.get("name") as string)?.trim();
  const brand = (formData.get("brand_name") as string)?.trim();
  if (!name) return { ok: false, message: "请填写门店名称" };
  try {
    await db.stores.update(ctx.store.id, { name, brand_name: brand || null });
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath("/admin");
  revalidatePath("/me");
  return { ok: true, message: "门店信息已更新" };
}

// 改员工姓名（管理者）
export async function updateEmployeeName(employeeId: string, name: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  if (!canEnterAdmin(ctx)) return { ok: false, message: "无权限" };
  const n = (name || "").trim();
  if (!n) return { ok: false, message: "请填写姓名" };
  try {
    await db.employees.update(employeeId, ctx.store.id, { name: n });
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath("/admin/employees");
  return { ok: true, message: "已更新姓名" };
}

// 改员工角色（管理者）：员工的权限由角色决定，改角色即调整其权限
export async function updateEmployeeRole(employeeId: string, role: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  if (!canEnterAdmin(ctx)) return { ok: false, message: "无权限" };
  const r = (role || "").trim();
  if (!r) return { ok: false, message: "请选择角色" };
  const target = await db.employees.getById(employeeId);
  if (!target || target.store_id !== ctx.store.id) return { ok: false, message: "员工不存在" };
  if (target.role === "owner") return { ok: false, message: "老板角色不可更改" };
  if (r === "owner") return { ok: false, message: "不能把员工设为老板" };
  try {
    await db.employees.update(employeeId, ctx.store.id, { role: r });
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath("/admin/employees");
  return { ok: true, message: "已更新角色" };
}

// 客户批量转移（管理者）：把某员工名下客户改派给另一个员工，用于离职交接
export async function transferCustomers(fromId: string, toId: string): Promise<ActionResult & { count?: number }> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  if (!canEnterAdmin(ctx)) return { ok: false, message: "无权限" };
  if (!fromId || !toId) return { ok: false, message: "请选择转出和接收的员工" };
  if (fromId === toId) return { ok: false, message: "不能转给同一个人" };
  let count = 0;
  try {
    count = await db.customers.reassign(ctx.store.id, fromId, toId);
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath("/customers");
  revalidatePath("/admin/customers");
  return { ok: true, message: count > 0 ? `已转移 ${count} 位客户` : "该员工名下暂无客户", count };
}

// 给「待分配公海」的客户指定负责人（导入未指定 / 离职无人接的客户）
export async function assignCustomer(customerId: string, employeeId: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  if (!canEnterAdmin(ctx)) return { ok: false, message: "无权限分配" };
  if (!employeeId) return { ok: false, message: "请选择负责人" };
  const emps = (await db.employees.listByStore(ctx.store.id)) as any[];
  if (!emps.some((e) => e.id === employeeId)) return { ok: false, message: "员工不存在" };
  try {
    await db.customers.update(customerId, ctx.store.id, { assigned_to: employeeId });
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath("/admin");
  revalidatePath("/admin/customers");
  revalidatePath("/customers");
  return { ok: true, message: "已分配负责人" };
}

// 批量分配负责人（多选客户 → 统一归到某员工）
export async function bulkAssignCustomers(customerIds: string[], employeeId: string): Promise<ActionResult & { count?: number }> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  if (!canEnterAdmin(ctx)) return { ok: false, message: "无权限" };
  if (!employeeId) return { ok: false, message: "请选择负责人" };
  if (!customerIds?.length) return { ok: false, message: "请先选择客户" };
  const emps = (await db.employees.listByStore(ctx.store.id)) as any[];
  if (!emps.some((e) => e.id === employeeId)) return { ok: false, message: "员工不存在" };
  let count = 0;
  for (const id of customerIds) {
    try { await db.customers.update(id, ctx.store.id, { assigned_to: employeeId }); count++; } catch {}
  }
  revalidatePath("/admin/customers");
  revalidatePath("/customers");
  revalidatePath("/admin");
  return { ok: count > 0, message: `已为 ${count} 位客户分配负责人`, count };
}

// 批量删除客户（多选 → 一次清理；不可恢复，老板/店长可用）
export async function bulkDeleteCustomers(customerIds: string[]): Promise<ActionResult & { count?: number }> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  if (!canEnterAdmin(ctx)) return { ok: false, message: "无权限删除" };
  if (!customerIds?.length) return { ok: false, message: "请先选择客户" };
  let count = 0;
  for (const id of customerIds) {
    try { await db.customers.delete(id, ctx.store.id); count++; } catch {}
  }
  revalidatePath("/admin/customers");
  revalidatePath("/customers");
  revalidatePath("/admin");
  return { ok: count > 0, message: `已删除 ${count} 位客户`, count };
}

// 重新识别负责人：不用重传名单，拿导入时存的「原始负责人名」按当前员工重新匹配一遍。
// 用于：员工改名/补建后，让之前对不上的客户自动归位。覆盖当前负责人（以原始表格为真实意图）。
export async function reassignCustomerOwners(
  customerIds: string[]
): Promise<ActionResult & { updated?: number; stillUnmatched?: number; noRecord?: number }> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  if (!canEnterAdmin(ctx)) return { ok: false, message: "无权限" };
  if (!customerIds?.length) return { ok: false, message: "请先勾选要重新识别的客户" };
  const emps = (await db.employees.listByStore(ctx.store.id)) as any[];
  const activeEmps = emps.filter((e) => e.status !== "disabled").map((e) => ({ id: e.id as string, name: String(e.name) }));
  let updated = 0, stillUnmatched = 0, noRecord = 0;
  for (const id of customerIds) {
    try {
      const c: any = await db.customers.getById(id, ctx.store.id);
      if (!c) continue;
      let raw = (c.import_owner_name || "").trim();
      // 兼容旧数据：没有新字段时，从备注里存的「表格负责人：XXX」解析出来
      if (!raw && c.notes) {
        const m = String(c.notes).match(/表格负责人[:：]\s*([^（(]+)/);
        if (m) raw = m[1].trim();
      }
      if (!raw) { noRecord++; continue; } // 当时表格就没写负责人，无从识别
      const hit = matchEmployeeId(raw, activeEmps);
      if (!hit) { stillUnmatched++; continue; } // 还是对不上（名字仍不一致）
      if (hit !== c.assigned_to) { await db.customers.update(id, ctx.store.id, { assigned_to: hit }); updated++; }
    } catch {}
  }
  revalidatePath("/admin/customers");
  revalidatePath("/customers");
  revalidatePath("/admin");
  const parts = [`已更新 ${updated} 位`];
  if (stillUnmatched) parts.push(`${stillUnmatched} 位名字仍对不上员工`);
  if (noRecord) parts.push(`${noRecord} 位没有原始负责人记录`);
  return { ok: true, message: parts.join("，"), updated, stillUnmatched, noRecord };
}

// 一键重新智能整理：对「批量导入」的客户，优先使用 v16 保存的原始行，
// 再扫描备注 / 跟进重点 / 原始负责人，补齐到店天数、下一步跟进，并识别疑似负责人。
export async function reorganizeImportedCustomers(): Promise<
  ActionResult & { stats?: Record<string, number> }
> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  if (!canEnterAdmin(ctx)) return { ok: false, message: "无权限" };
  const emps = (await db.employees.listByStore(ctx.store.id)) as any[];
  const activeEmps = emps.filter((e) => e.status !== "disabled").map((e) => ({ id: e.id as string, name: String(e.name) }));
  const all = (await db.customers.listByStore(ctx.store.id)) as any[];
  const imported = all.filter((c) => c.source === "批量导入");
  let filledVisit = 0, filledFollow = 0, filledFocus = 0, suspect = 0, total = imported.length;
  let withInsight = 0, withEvidence = 0, aiHighConfidence = 0, aiMediumConfidence = 0, aiNeedsReview = 0, dataGapCount = 0;
  const nowIso = new Date().toISOString();
  for (const c of imported) {
    const raw = (c.import_raw || {}) as Record<string, any>;
    const rawFocus = String(raw.focus || "").trim();
    const rawNotes = String(raw.notes || c.notes || "");
    const rawProject = String(raw.project || "");
    const rawAmount = String(raw.amount || "");
    const lastVisitDays = c.last_visit_at
      ? Math.max(0, Math.floor((Date.now() - new Date(c.last_visit_at).getTime()) / 86400000))
      : extractDaysSinceVisit(`${rawNotes} ${rawFocus}`);
    const isDeal = c.stage === "deal" || !!rawAmount || /成交|老客|复购|续卡|维护卡|年度|回访|复查/.test(`${rawProject} ${rawNotes} ${rawFocus}`);
    const insight = buildImportInsight({
      name: c.name,
      phone: c.phone,
      notes: rawNotes,
      project: rawProject,
      amount: rawAmount,
      rawFocus,
      lastVisitDays,
      isDeal,
    });
    const derivedFocus = !rawFocus ? deriveFollowupFocus(rawNotes, rawProject) : null;
    const focus = String(rawFocus || insight?.aiJudge || derivedFocus || c.ai_suggestion || "").trim();
    const textForVisit = `${rawNotes} ${c.notes || ""} ${focus}`;
    const patch: Record<string, any> = {};
    if (insight) {
      withInsight++;
      if (insight.evidence.length) withEvidence++;
      if (insight.needsReview) {
        aiNeedsReview++;
        if (insight.reviewReasons?.length) dataGapCount++;
      }
      else if (insight.confidence >= 0.85) aiHighConfidence++;
      else aiMediumConfidence++;
      patch.import_raw = {
        ...raw,
        insight,
        quality: {
          confidence: insight.confidence,
          needsReview: insight.needsReview,
          evidenceCount: insight.evidence.length,
          source: insight.source,
          version: insight.version,
          dataCompleteness: insight.dataCompleteness,
          reviewReasons: insight.reviewReasons,
        },
      };
    }

    // ① 补「上次到店」：优先用原始列，其次从自然语言（「45天未到店 / 中断30天」）解析
    if (!c.last_visit_at) {
      let lv: string | null = null;
      const rawLastVisit = String(raw.lastVisit || "").trim();
      if (rawLastVisit) {
        const dayHit = rawLastVisit.match(/^(\d+)\s*天$/) || rawLastVisit.match(/^(\d{1,3})$/);
        const days = dayHit ? parseInt(dayHit[1], 10) : NaN;
        if (!isNaN(days) && days >= 0 && days < 3650) lv = new Date(Date.now() - days * 86400000).toISOString();
        else {
          const d = new Date(rawLastVisit.replace(/[./]/g, "-"));
          if (!isNaN(d.getTime())) lv = d.toISOString();
        }
      }
      if (!lv) {
        const nd = extractDaysSinceVisit(textForVisit);
        if (nd != null) lv = new Date(Date.now() - nd * 86400000).toISOString();
      }
      if (lv) { patch.last_visit_at = lv; filledVisit++; }
    }

    if (focus && focus !== String(c.ai_suggestion || "").trim()) {
      patch.ai_suggestion = focus;
      patch.ai_suggested_at = c.ai_suggested_at || nowIso;
      filledFocus++;
    }

    // ② 补「下一步跟进」：从跟进重点的「第N天」算
    if (!c.next_follow_at) {
      const planDays = extractFollowupDays(rawFocus || insight?.nextAction || focus);
      const nf = nextFollowFromPlan(c.last_deal_at, planDays.length ? planDays : (insight?.followupDays || []));
      if (nf) { patch.next_follow_at = nf; filledFollow++; }
    }

    // ③ 负责人状态落库：精确匹配才标 matched；形近只标 suspect，不自动覆盖 assigned_to。
    const ownerName = String(c.import_owner_name || raw.owner || "").trim();
    if (ownerName && !c.owner_match_status) {
      const hit = matchEmployeeId(ownerName, activeEmps);
      if (hit) patch.owner_match_status = "matched";
      else {
        const sug = suggestEmployee(ownerName, activeEmps);
        patch.owner_match_status = sug ? "suspect" : "unmatched";
        if (sug) suspect++;
      }
    }

    if (Object.keys(patch).length) {
      try { await db.customers.update(c.id, ctx.store.id, patch); } catch {}
    }
  }
  revalidatePath("/admin/customers");
  revalidatePath("/customers");
  revalidatePath("/work");
  revalidatePath("/admin");
  return {
    ok: true,
    message: `整理 ${total} 位：补到店 ${filledVisit}、刷新AI建议 ${filledFocus}、生成下一步 ${filledFollow}、疑似负责人 ${suspect}`,
    stats: { total, filledVisit, filledFocus, filledFollow, suspect, withInsight, withEvidence, aiHighConfidence, aiMediumConfidence, aiNeedsReview, dataGapCount },
  };
}

// 批量设置「最近到店日期」：名单没有日期列时，给老客统一设个基准日期，
// 系统就能按「多久没来」自动判沉睡/老客、产生待唤醒提醒。
export async function bulkSetLastVisit(customerIds: string[], dateStr: string): Promise<ActionResult & { count?: number }> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  if (!canEnterAdmin(ctx)) return { ok: false, message: "无权限" };
  if (!customerIds?.length) return { ok: false, message: "请先勾选客户" };
  if (!dateStr) return { ok: false, message: "请选择日期" };
  const d = new Date(dateStr.replace(/[./]/g, "-"));
  if (isNaN(d.getTime())) return { ok: false, message: "日期格式不对" };
  if (d.getTime() > Date.now()) return { ok: false, message: "到店日期不能晚于今天" };
  const iso = d.toISOString();
  let count = 0;
  for (const id of customerIds) {
    try { await db.customers.update(id, ctx.store.id, { last_visit_at: iso }); count++; } catch {}
  }
  revalidatePath("/admin/customers");
  revalidatePath("/customers");
  revalidatePath("/admin");
  return { ok: count > 0, message: `已为 ${count} 位客户设置最近到店日期`, count };
}

// 演示模式：列出门店真实员工，供「切换角色」面板按真实姓名/角色显示
// （取代写死的 7 个假账号，这样改名/新增的员工也会出现、且和工作台身份一致）
const DEMO_SWITCH_ACCOUNTS = DEMO_ACCOUNT_TEMPLATES;

async function publicDemoSwitchAccounts(): Promise<{ name: string; roleLabel: string; email: string; entry: string }[]> {
  try {
    const rows = await db.startup.listDemoEmployees(DEMO_SWITCH_ACCOUNTS.map((account) => account.email));
    const byEmail = new Map<string, any>();
    for (const row of rows as any[]) {
      const employees = Array.isArray(row.employees) ? row.employees : row.employees ? [row.employees] : [];
      const active = employees.find((employee: any) => employee.status === "active");
      if (active) byEmail.set(row.email, active);
    }
    const storeIds = Array.from(
      new Set(
        Array.from(byEmail.values())
          .map((employee) => employee.store_id)
          .filter((storeId): storeId is string => !!storeId)
      )
    );
    const roleLabelsByStore = new Map(
      await Promise.all(storeIds.map(async (storeId) => [storeId, await db.roles.labelMap(storeId)] as const))
    );
    return DEMO_SWITCH_ACCOUNTS.flatMap((account) => {
      const employee = byEmail.get(account.email);
      if (!employee) return [];
      const labels = employee.store_id ? roleLabelsByStore.get(employee.store_id) : undefined;
      return [{
        name: employee.name || account.name,
        roleLabel: roleLabel(employee.role || account.roleKey, labels),
        email: account.email,
        entry: isAdminRole(employee.role || account.roleKey) ? "/admin" : "/work",
      }];
    });
  } catch {
    return DEMO_SWITCH_ACCOUNTS.map((account) => ({
      name: account.name,
      roleLabel: account.roleOverride || account.fallbackRole,
      email: account.email,
      entry: account.entry,
    }));
  }
}

export async function listDemoSwitchAccounts(): Promise<
  { name: string; roleLabel: string; email: string; entry: string }[]
> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") return [];
  const ctx = await getAuthContext();
  if (!ctx) return publicDemoSwitchAccounts();
  const emps = (await db.employees.listByStoreWithLogin(ctx.store.id)) as any[];
  return (emps || [])
    .map((e) => {
      // join 出来的 users 可能是对象或数组，统一取 email
      const u = Array.isArray(e.users) ? e.users[0] : e.users;
      return { e, email: u?.email as string | undefined };
    })
    .filter(({ e, email }) => e.status !== "disabled" && !!email)
    .map(({ e, email }) => ({
      name: e.name,
      roleLabel: roleLabel(e.role, ctx.roleLabels),
      email: email as string,
      entry: isAdminRole(e.role) ? "/admin" : "/work",
    }));
}

// 把一篇知识资料转移到另一个分类（文档+片段同步）
export async function updateDocCategory(docId: string, category: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  if (!hasPermission(ctx, "knowledge", "edit")) return { ok: false, message: "无权限" };
  const c = (category || "").trim();
  if (!c) return { ok: false, message: "请选择分类" };
  try {
    await db.knowledge.setDocCategory(docId, ctx.store.id, c);
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath("/admin/knowledge");
  return { ok: true, message: `已转移到「${c}」` };
}

// 自定义配置：整类保存（code + display_name + 启用/可见/排序），真实持久化到 store_config
export async function saveConfigCategory(
  category: string,
  items: { code: string; name: string; enabled: boolean; visibleToStaff: boolean }[]
): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  if (!canEnterAdmin(ctx)) return { ok: false, message: "无权限" };
  try {
    await db.config.replaceCategory(
      ctx.store.id,
      category,
      items.map((it) => ({
        code: it.code,
        display_name: it.name,
        enabled: it.enabled,
        visible_to_staff: it.visibleToStaff,
      }))
    );
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath("/settings/config");
  return { ok: true, message: "已保存" };
}

// 会谈复盘 → 沉淀为门店经验（写入 store scope 长记忆，反哺全店）
export async function saveStoreExperience(key: string, value: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  const v = (value || "").trim();
  if (!v) return { ok: false, message: "内容为空" };
  try {
    await db.memory.upsert({
      store_id: ctx.store.id,
      scope: "store",
      ref_id: ctx.store.id,
      key: key.slice(0, 80),
      value: v,
      confidence: 1,
      source: "meeting",
    });
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath("/admin");
  return { ok: true, message: "已沉淀为门店经验" };
}

// ---------------- 工作台：客户反馈 / 异常登记 ----------------
export async function createFeedback(formData: FormData): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: "未登录" };
  const customerName = (formData.get("customer_name") as string)?.trim() || "未留名客户";
  const feedback_type = (formData.get("feedback_type") as string) || "服务体验";
  const content = (formData.get("content") as string)?.trim();
  const scoreRaw = formData.get("score") as string;
  const score = scoreRaw ? parseInt(scoreRaw, 10) : null;
  if (!content) return { ok: false, message: "请填写反馈内容" };

  // 投诉/异常类自动升级为风险记录（老板/店长可见）
  const isRisk = ["投诉", "情绪异常", "到店不满", "爽约"].includes(feedback_type);
  try {
    const cust = await db.customers.create({
      store_id: ctx.store.id,
      name: customerName,
      assigned_to: ctx.employee.id,
    });
    await db.feedback.create({
      store_id: ctx.store.id,
      customer_id: cust.id,
      employee_id: ctx.employee.id,
      feedback_type,
      score,
      content,
      risk_flag: isRisk,
    });
    if (isRisk) {
      await db.risks.create({
        store_id: ctx.store.id,
        employee_id: ctx.employee.id,
        question: `[客户异常] ${customerName}：${feedback_type}`,
        ai_response: content,
        risk_type: "客诉处理",
        risk_level: "L3",
        status: "open",
      });
    }
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
  revalidatePath("/work");
  revalidatePath("/admin");
  return { ok: true, message: isRisk ? "已登记并升级给老板/店长" : "已记录客户反馈" };
}
