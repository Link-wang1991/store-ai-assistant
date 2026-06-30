// ============================================================
// 数据访问适配层（lib/db）
// 页面 / actions / pipeline 只通过这里访问数据，不直接接触 Supabase。
// 迁移到其他数据库时，只需替换本目录下的实现（保持方法签名不变）。
//
// 当前实现：Supabase（service_role）。
// 迁移示例：新增 lib/db/mysql.ts 实现同样的方法，把下面的 import 换掉即可。
// ============================================================

import { supabaseAdmin } from "../supabase/admin";

const sb = () => supabaseAdmin();

// ---------------- stores ----------------
export const stores = {
  async getById(id: string) {
    const { data } = await sb().from("stores").select("*").eq("id", id).maybeSingle();
    return data;
  },
  async countActive() {
    const { count } = await sb()
      .from("stores")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");
    return count || 0;
  },
  async listActive() {
    const { data } = await sb()
      .from("stores")
      .select("id, name, brand_name")
      .eq("status", "active");
    return data || [];
  },
  async setOwner(id: string, ownerUserId: string) {
    await sb().from("stores").update({ owner_id: ownerUserId }).eq("id", id);
  },
  async update(id: string, patch: Record<string, any>) {
    const { error } = await sb().from("stores").update(patch).eq("id", id);
    if (error) throw error;
  },
};

// ---------------- users ----------------
export const users = {
  async getByAuthId(authUserId: string) {
    const { data } = await sb()
      .from("users")
      .select("*")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    return data;
  },
  async create(input: { auth_user_id: string; name?: string; email?: string; phone?: string | null }) {
    const { data, error } = await sb().from("users").insert(input).select("id").single();
    if (error) throw error;
    return data as { id: string };
  },
  async countByEmails(emails: string[]) {
    const { count } = await sb()
      .from("users")
      .select("*", { count: "exact", head: true })
      .in("email", emails);
    return count || 0;
  },
};

// ---------------- employees ----------------
export const employees = {
  async getActiveByUserId(userId: string) {
    const { data } = await sb()
      .from("employees")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    return data;
  },
  async getById(id: string) {
    const { data } = await sb().from("employees").select("*").eq("id", id).maybeSingle();
    return data;
  },
  async listByStore(storeId: string) {
    const { data } = await sb()
      .from("employees")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at", { ascending: true });
    return data || [];
  },
  async listActiveByStore(storeId: string) {
    const { data } = await sb()
      .from("employees")
      .select("id, name, role")
      .eq("store_id", storeId)
      .eq("status", "active")
      .order("created_at", { ascending: true });
    return data || [];
  },
  // 带登录邮箱（email 在 users 表，需 join）——供演示角色切换器用
  async listByStoreWithLogin(storeId: string) {
    const { data } = await sb()
      .from("employees")
      .select("id, name, role, status, users(email)")
      .eq("store_id", storeId)
      .order("created_at", { ascending: true });
    return data || [];
  },
  async getOwner(storeId: string) {
    const { data } = await sb()
      .from("employees")
      .select("id")
      .eq("store_id", storeId)
      .eq("role", "owner")
      .maybeSingle();
    return data;
  },
  async create(input: Record<string, any>) {
    const { error } = await sb().from("employees").insert(input);
    if (error) throw error;
  },
  async setStatus(id: string, status: string, disabledAt: string | null) {
    await sb().from("employees").update({ status, disabled_at: disabledAt }).eq("id", id);
  },
  async update(id: string, storeId: string, patch: Record<string, any>) {
    const { error } = await sb().from("employees").update(patch).eq("id", id).eq("store_id", storeId);
    if (error) throw error;
  },
};

// ---------------- knowledge ----------------
export const knowledge = {
  async listDocs(storeId: string) {
    const { data } = await sb()
      .from("knowledge_documents")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false });
    return data || [];
  },
  async getDoc(id: string) {
    const { data } = await sb().from("knowledge_documents").select("*").eq("id", id).maybeSingle();
    return data;
  },
  async createDoc(input: Record<string, any>) {
    const { data, error } = await sb()
      .from("knowledge_documents")
      .insert(input)
      .select("id")
      .single();
    if (error) throw error;
    return data as { id: string };
  },
  async setDocStatus(id: string, status: string) {
    await sb().from("knowledge_documents").update({ status }).eq("id", id);
    await sb().from("knowledge_chunks").update({ status }).eq("document_id", id);
  },
  // 改可见角色：文档与其所有片段同步（检索按片段的 visible_roles 过滤）
  async setDocVisibleRoles(id: string, storeId: string, roles: string[]) {
    await sb().from("knowledge_documents").update({ visible_roles: roles }).eq("id", id).eq("store_id", storeId);
    await sb().from("knowledge_chunks").update({ visible_roles: roles }).eq("document_id", id).eq("store_id", storeId);
  },
  // 转移分类：文档与其所有片段同步改 category（检索/展示都按这个）
  async setDocCategory(id: string, storeId: string, category: string) {
    await sb().from("knowledge_documents").update({ category }).eq("id", id).eq("store_id", storeId);
    await sb().from("knowledge_chunks").update({ category }).eq("document_id", id).eq("store_id", storeId);
  },
  async deleteDoc(id: string, storeId: string) {
    await sb().from("knowledge_documents").delete().eq("id", id).eq("store_id", storeId);
  },
  async createChunks(rows: Record<string, any>[]) {
    const { error } = await sb().from("knowledge_chunks").insert(rows);
    if (error) throw error;
  },
  async listChunkDocIds(storeId: string) {
    const { data } = await sb()
      .from("knowledge_chunks")
      .select("document_id")
      .eq("store_id", storeId);
    return (data || []).map((c: any) => c.document_id as string);
  },
  // 某文档的所有片段（预览用）
  async getChunksByDoc(documentId: string, storeId: string) {
    const { data } = await sb()
      .from("knowledge_chunks")
      .select("id, title, content, category, status")
      .eq("document_id", documentId)
      .eq("store_id", storeId)
      .order("created_at", { ascending: true });
    return data || [];
  },
  // 检索候选：同门店 + 启用 + 当前角色可见
  async listRetrievable(storeId: string, role: string) {
    const { data, error } = await sb()
      .from("knowledge_chunks")
      .select("id, title, content, category, visible_roles, status, store_id")
      .eq("store_id", storeId)
      .eq("status", "active")
      .contains("visible_roles", [role]);
    if (error) throw error;
    return data || [];
  },
  // 语义检索（向量余弦）。queryLiteral 为 pgvector 字面量 '[...]'
  async matchChunks(storeId: string, role: string, queryLiteral: string, count: number) {
    const { data, error } = await sb().rpc("match_knowledge_chunks", {
      p_store_id: storeId,
      p_role: role,
      p_query: queryLiteral,
      p_count: count,
    });
    if (error) throw error;
    return data || [];
  },
  // 回填用：列出缺 embedding 的启用片段
  async listChunksMissingEmbedding(limit = 500) {
    const { data } = await sb()
      .from("knowledge_chunks")
      .select("id, title, content")
      .eq("status", "active")
      .is("embedding", null)
      .limit(limit);
    return data || [];
  },
  async setChunkEmbedding(id: string, embeddingLiteral: string) {
    const { error } = await sb()
      .from("knowledge_chunks")
      .update({ embedding: embeddingLiteral })
      .eq("id", id);
    if (error) throw error;
  },
};

// ---------------- chat ----------------
export const chat = {
  async getLatestSession(employeeId: string) {
    const { data } = await sb()
      .from("chat_sessions")
      .select("id")
      .eq("employee_id", employeeId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  },
  // 员工的会话列表（多会话切换用）
  async listSessionsByEmployee(employeeId: string, limit = 30) {
    const { data } = await sb()
      .from("chat_sessions")
      .select("id, title, updated_at")
      .eq("employee_id", employeeId)
      .order("updated_at", { ascending: false })
      .limit(limit);
    return data || [];
  },
  async getSession(id: string, employeeId: string) {
    const { data } = await sb()
      .from("chat_sessions")
      .select("id")
      .eq("id", id)
      .eq("employee_id", employeeId)
      .maybeSingle();
    return data;
  },
  async createSession(input: Record<string, any>) {
    const { data, error } = await sb().from("chat_sessions").insert(input).select("id").single();
    if (error) throw error;
    return data as { id: string };
  },
  async touchSession(id: string) {
    await sb().from("chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", id);
  },
  async insertMessage(input: Record<string, any>) {
    const { data, error } = await sb().from("chat_messages").insert(input).select("id").single();
    if (error) throw error;
    return data as { id: string };
  },
  async listSessionMessages(sessionId: string, limit = 20) {
    const { data } = await sb()
      .from("chat_messages")
      .select("id, user_message, ai_response, risk_level, answer_type")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(limit);
    return data || [];
  },
  async listRecentByStore(storeId: string, limit = 8) {
    const { data } = await sb()
      .from("chat_messages")
      .select("id, user_message, risk_level, created_at, employees(name, role)")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  },
  async listRecentByEmployee(employeeId: string, limit = 10) {
    const { data } = await sb()
      .from("chat_messages")
      .select("id, user_message, created_at")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  },
  // 今日/区间消息元数据（用于统计：活跃员工、分类、风险）
  async listMetaSince(storeId: string, since: string) {
    const { data } = await sb()
      .from("chat_messages")
      .select("employee_id, question_category, risk_level")
      .eq("store_id", storeId)
      .gte("created_at", since);
    return data || [];
  },
  async countSince(storeId: string, since: string) {
    const { count } = await sb()
      .from("chat_messages")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId)
      .gte("created_at", since);
    return count || 0;
  },
};

// ---------------- startup / health ----------------
export const startup = {
  async getDemoStatus(emails: string[]) {
    const [storeCountResult, employeeResult] = await Promise.all([
      sb().from("stores").select("*", { count: "exact", head: true }).eq("status", "active"),
      sb()
        .from("users")
        .select("email, employees(role, status)")
        .in("email", emails),
    ]);

    if (storeCountResult.error) throw storeCountResult.error;
    if (employeeResult.error) throw employeeResult.error;

    const activeEmails = new Set(
      (employeeResult.data || [])
        .filter((u: any) => (u.employees || []).some((e: any) => e.status === "active"))
        .map((u: any) => u.email)
    );

    return {
      activeStoreCount: storeCountResult.count || 0,
      demoAccountCount: activeEmails.size,
      demoAccountsReady: emails.every((email) => activeEmails.has(email)),
    };
  },
  async listDemoEmployees(emails: string[]) {
    const { data, error } = await sb()
      .from("users")
      .select("email, employees(name, role, status, store_id, position)")
      .in("email", emails);
    if (error) throw error;
    return data || [];
  },
};

// ---------------- pending_questions ----------------
export const pending = {
  async listPending(storeId: string, limit?: number) {
    let q = sb()
      .from("pending_questions")
      .select("*, employees!pending_questions_employee_id_fkey(name, role)")
      .eq("store_id", storeId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (limit) q = q.limit(limit);
    const { data } = await q;
    return data || [];
  },
  async getById(id: string, storeId: string) {
    const { data } = await sb()
      .from("pending_questions")
      .select("*")
      .eq("id", id)
      .eq("store_id", storeId)
      .maybeSingle();
    return data;
  },
  async create(input: Record<string, any>) {
    const { error } = await sb().from("pending_questions").insert(input);
    if (error) throw error;
  },
  async update(id: string, patch: Record<string, any>) {
    await sb().from("pending_questions").update(patch).eq("id", id);
  },
  async countPending(storeId: string) {
    const { count } = await sb()
      .from("pending_questions")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("status", "pending");
    return count || 0;
  },
  async listByStore(storeId: string, limit = 50) {
    const { data } = await sb()
      .from("pending_questions")
      .select("*, employees!pending_questions_employee_id_fkey(name, role)")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  },
  async delete(id: string, storeId: string) {
    await sb().from("pending_questions").delete().eq("id", id).eq("store_id", storeId);
  },
};

// ---------------- knowledge_gaps ----------------
export const gaps = {
  async findPending(storeId: string, question: string) {
    const { data } = await sb()
      .from("knowledge_gaps")
      .select("id, frequency")
      .eq("store_id", storeId)
      .eq("question", question)
      .eq("status", "pending")
      .maybeSingle();
    return data;
  },
  async create(input: Record<string, any>) {
    const { error } = await sb().from("knowledge_gaps").insert(input);
    if (error) throw error;
  },
  async setFrequency(id: string, frequency: number) {
    await sb().from("knowledge_gaps").update({ frequency }).eq("id", id);
  },
  async listPending(storeId: string) {
    const { data } = await sb()
      .from("knowledge_gaps")
      .select("*, employees(name, role)")
      .eq("store_id", storeId)
      .eq("status", "pending")
      .order("frequency", { ascending: false })
      .order("created_at", { ascending: false });
    return data || [];
  },
  async getById(id: string, storeId: string) {
    const { data } = await sb()
      .from("knowledge_gaps")
      .select("*")
      .eq("id", id)
      .eq("store_id", storeId)
      .maybeSingle();
    return data;
  },
  async setStatus(id: string, status: string) {
    await sb().from("knowledge_gaps").update({ status }).eq("id", id);
  },
  async countPending(storeId: string) {
    const { count } = await sb()
      .from("knowledge_gaps")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("status", "pending");
    return count || 0;
  },
  async countSince(storeId: string, since: string) {
    const { count } = await sb()
      .from("knowledge_gaps")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId)
      .gte("created_at", since);
    return count || 0;
  },
  async delete(id: string, storeId: string) {
    await sb().from("knowledge_gaps").delete().eq("id", id).eq("store_id", storeId);
  },
};

// ---------------- risk_logs ----------------
export const risks = {
  async create(input: Record<string, any>) {
    const { error } = await sb().from("risk_logs").insert(input);
    if (error) throw error;
  },
  async listOpen(storeId: string, limit?: number) {
    let q = sb()
      .from("risk_logs")
      .select("*, employees!risk_logs_employee_id_fkey(name, role)")
      .eq("store_id", storeId)
      .eq("status", "open")
      .order("created_at", { ascending: false });
    if (limit) q = q.limit(limit);
    const { data } = await q;
    return data || [];
  },
  async resolve(id: string, storeId: string, patch: Record<string, any>) {
    await sb().from("risk_logs").update(patch).eq("id", id).eq("store_id", storeId);
  },
  async countOpen(storeId: string) {
    const { count } = await sb()
      .from("risk_logs")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("status", "open");
    return count || 0;
  },
  async listByStore(storeId: string, limit = 50) {
    const { data } = await sb()
      .from("risk_logs")
      .select("*, employees!risk_logs_employee_id_fkey(name, role)")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  },
  async delete(id: string, storeId: string) {
    await sb().from("risk_logs").delete().eq("id", id).eq("store_id", storeId);
  },
};

// ---------------- tasks ----------------
export const tasks = {
  async listByAssignee(storeId: string, employeeId: string) {
    const { data } = await sb()
      .from("tasks")
      .select("*")
      .eq("store_id", storeId)
      .eq("assigned_to", employeeId)
      .order("created_at", { ascending: false });
    return data || [];
  },
  async listByStore(storeId: string) {
    const { data } = await sb()
      .from("tasks")
      .select("*, employees:assigned_to(name, role)")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false });
    return data || [];
  },
  async getById(id: string) {
    const { data } = await sb()
      .from("tasks")
      .select("store_id, assigned_to")
      .eq("id", id)
      .maybeSingle();
    return data;
  },
  async create(input: Record<string, any>) {
    const { error } = await sb().from("tasks").insert(input);
    if (error) throw error;
  },
  async update(id: string, patch: Record<string, any>) {
    await sb().from("tasks").update(patch).eq("id", id);
  },
};

// ---------------- banned_words ----------------
export const banned = {
  async listByStore(storeId: string) {
    const { data } = await sb()
      .from("banned_words")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false });
    return data || [];
  },
  async listWords(storeId: string) {
    const { data } = await sb().from("banned_words").select("word").eq("store_id", storeId);
    return (data || []).map((r: any) => r.word as string);
  },
  async create(input: Record<string, any>) {
    const { error } = await sb().from("banned_words").insert(input);
    if (error) throw error;
  },
  async delete(id: string, storeId: string) {
    await sb().from("banned_words").delete().eq("id", id).eq("store_id", storeId);
  },
};

// ---------------- standard_answers ----------------
export const standard = {
  async listActive(storeId: string) {
    const { data } = await sb()
      .from("standard_answers")
      .select("*")
      .eq("store_id", storeId)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    return data || [];
  },
  async create(input: Record<string, any>) {
    const { error } = await sb().from("standard_answers").insert(input);
    if (error) throw error;
  },
};

// ---------------- reports（老板日报 / 周报）----------------
export const reports = {
  async create(input: Record<string, any>) {
    const { data, error } = await sb().from("reports").insert(input).select("id").single();
    if (error) throw error;
    return data as { id: string };
  },
  async listByStore(storeId: string, type?: string, limit = 10) {
    let q = sb()
      .from("reports")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (type) q = q.eq("report_type", type);
    const { data } = await q;
    return data || [];
  },
};

// ---------------- roles：角色定义 + 权限矩阵 ----------------
export const roles = {
  async listDefinitions(storeId: string) {
    const { data } = await sb()
      .from("role_definitions")
      .select("*")
      .eq("store_id", storeId)
      .order("sort_order", { ascending: true });
    return data || [];
  },
  // role_key -> 门店自定义展示名（仅启用）
  async labelMap(storeId: string): Promise<Record<string, string>> {
    const { data } = await sb()
      .from("role_definitions")
      .select("role_key, display_name")
      .eq("store_id", storeId)
      .eq("status", "active");
    const m: Record<string, string> = {};
    for (const d of (data || []) as any[]) m[d.role_key] = d.display_name;
    return m;
  },
  async createDefinition(input: Record<string, any>) {
    const { error } = await sb().from("role_definitions").insert(input);
    if (error) throw error;
  },
  async updateDefinition(id: string, storeId: string, patch: Record<string, any>) {
    await sb().from("role_definitions").update(patch).eq("id", id).eq("store_id", storeId);
  },
  async listPermissions(storeId: string) {
    const { data } = await sb().from("role_permissions").select("*").eq("store_id", storeId);
    return data || [];
  },
  async upsertPermission(input: Record<string, any>) {
    const { error } = await sb()
      .from("role_permissions")
      .upsert(input, { onConflict: "store_id,role_key,module" });
    if (error) throw error;
  },
  async listActiveDefinitions(storeId: string) {
    const { data } = await sb()
      .from("role_definitions")
      .select("*")
      .eq("store_id", storeId)
      .eq("status", "active")
      .order("sort_order", { ascending: true });
    return data || [];
  },
  async getDefinition(storeId: string, roleKey: string) {
    const { data } = await sb()
      .from("role_definitions")
      .select("*")
      .eq("store_id", storeId)
      .eq("role_key", roleKey)
      .maybeSingle();
    return data;
  },
  async permissionsForRole(storeId: string, roleKey: string) {
    const { data } = await sb()
      .from("role_permissions")
      .select("module, actions, data_scope")
      .eq("store_id", storeId)
      .eq("role_key", roleKey);
    return data || [];
  },
};

// ---------------- announcements：通知 / 公告 ----------------
export const announcements = {
  async listAll(storeId: string) {
    const { data } = await sb()
      .from("announcements")
      .select("*")
      .eq("store_id", storeId)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });
    return data || [];
  },
  // 当前生效、且对该员工可见的通知
  // roleKeys：当前员工的 [role_key, base_role]，任一命中可见角色即可见
  async listVisible(storeId: string, roleKeys: string[], employeeId: string) {
    const all = await this.listActiveNow(storeId);
    return all.filter((a: any) => {
      const roles = a.visible_roles || [];
      const targets = a.target_employee_ids || [];
      if (roles.length === 0 && targets.length === 0) return true; // 全员可见
      const roleMatch = roles.some((r: string) => roleKeys.includes(r));
      const empMatch = targets.includes(employeeId);
      return roleMatch || empMatch;
    });
  },
  async listActiveNow(storeId: string) {
    const now = new Date().toISOString();
    const { data } = await sb()
      .from("announcements")
      .select("*")
      .eq("store_id", storeId)
      .eq("status", "active")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });
    return (data || []).filter((a: any) => {
      const startOk = !a.start_at || a.start_at <= now;
      const endOk = !a.end_at || a.end_at >= now;
      return startOk && endOk;
    });
  },
  async create(input: Record<string, any>) {
    const { error } = await sb().from("announcements").insert(input);
    if (error) throw error;
  },
  async setStatus(id: string, storeId: string, status: string) {
    await sb().from("announcements").update({ status }).eq("id", id).eq("store_id", storeId);
  },
  async delete(id: string, storeId: string) {
    await sb().from("announcements").delete().eq("id", id).eq("store_id", storeId);
  },
};

// ---------------- schedules：排班 ----------------
export const schedules = {
  async forEmployeeRange(storeId: string, employeeId: string, fromDate: string, toDate: string) {
    const { data } = await sb()
      .from("schedules")
      .select("*")
      .eq("store_id", storeId)
      .eq("employee_id", employeeId)
      .gte("work_date", fromDate)
      .lte("work_date", toDate)
      .order("work_date", { ascending: true });
    return data || [];
  },
  async forDate(storeId: string, date: string) {
    const { data } = await sb()
      .from("schedules")
      .select("*, employees(name, role)")
      .eq("store_id", storeId)
      .eq("work_date", date)
      .order("start_time", { ascending: true });
    return data || [];
  },
  async create(input: Record<string, any>) {
    const { error } = await sb().from("schedules").insert(input);
    if (error) throw error;
  },
};

// ---------------- campaigns：活动 ----------------
export const campaigns = {
  async listActive(storeId: string) {
    const { data } = await sb()
      .from("campaigns")
      .select("*")
      .eq("store_id", storeId)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    return data || [];
  },
  async create(input: Record<string, any>) {
    const { error } = await sb().from("campaigns").insert(input);
    if (error) throw error;
  },
};

// ---------------- service_projects：项目 / 套餐 ----------------
export const projects = {
  async listActive(storeId: string) {
    const { data } = await sb()
      .from("service_projects")
      .select("*")
      .eq("store_id", storeId)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    return data || [];
  },
  async create(input: Record<string, any>) {
    const { error } = await sb().from("service_projects").insert(input);
    if (error) throw error;
  },
};

// ---------------- customers / followups / feedback / consultations（阶段 2 工作台用）----------------
export const customers = {
  async listByStore(storeId: string) {
    const { data } = await sb()
      .from("customer_records")
      .select("*")
      .eq("store_id", storeId)
      .order("updated_at", { ascending: false });
    return data || [];
  },
  async listByAssignee(storeId: string, employeeId: string) {
    const { data } = await sb()
      .from("customer_records")
      .select("*")
      .eq("store_id", storeId)
      .eq("assigned_to", employeeId)
      .order("updated_at", { ascending: false });
    return data || [];
  },
  // 待分配公海：没有负责人的客户（导入未指定 / 离职交接后无人接）
  async listUnassigned(storeId: string) {
    const { data } = await sb()
      .from("customer_records")
      .select("*")
      .eq("store_id", storeId)
      .is("assigned_to", null)
      .order("created_at", { ascending: false });
    return data || [];
  },
  async getById(id: string, storeId: string) {
    const { data } = await sb()
      .from("customer_records")
      .select("*, employees(name, role)")
      .eq("id", id)
      .eq("store_id", storeId)
      .maybeSingle();
    return data;
  },
  async update(id: string, storeId: string, patch: Record<string, any>) {
    const { error } = await sb()
      .from("customer_records")
      .update(patch)
      .eq("id", id)
      .eq("store_id", storeId);
    if (error) throw error;
  },
  // 删除客户档案：关联表（会谈/机会/跟进/互动）均 on delete set null，自动解除关联、保留记录
  async delete(id: string, storeId: string) {
    const { error } = await sb().from("customer_records").delete().eq("id", id).eq("store_id", storeId);
    if (error) throw error;
  },
  async create(input: Record<string, any>) {
    const { data, error } = await sb().from("customer_records").insert(input).select("id").single();
    if (error) throw error;
    return data as { id: string };
  },
  // 批量导入（C1）：一次插入多条
  async createMany(rows: Record<string, any>[]) {
    if (!rows.length) return 0;
    const { error } = await sb().from("customer_records").insert(rows);
    if (error) throw error;
    return rows.length;
  },
  // 客户批量转移：把某员工名下的客户改派给另一个员工（离职交接用）
  async reassign(storeId: string, fromEmployeeId: string, toEmployeeId: string) {
    const { data, error } = await sb()
      .from("customer_records")
      .update({ assigned_to: toEmployeeId })
      .eq("store_id", storeId)
      .eq("assigned_to", fromEmployeeId)
      .select("id");
    if (error) throw error;
    return (data || []).length;
  },
  // 到了下次跟进时间、且未流失的客户（增长作战室「该跟进」用）
  async listDueFollow(storeId: string, before: string, limit = 20) {
    const { data } = await sb()
      .from("customer_records")
      .select("*")
      .eq("store_id", storeId)
      .not("next_follow_at", "is", null)
      .lte("next_follow_at", before)
      .order("next_follow_at", { ascending: true })
      .limit(limit);
    return data || [];
  },
};

// ---------------- customer_interactions：客户互动时间线（长记忆流水）----------------
export const interactions = {
  async create(input: Record<string, any>) {
    const { error } = await sb().from("customer_interactions").insert(input);
    if (error) throw error;
  },
  async listByCustomer(customerId: string, storeId: string, limit = 30) {
    const { data } = await sb()
      .from("customer_interactions")
      .select("*, employees(name, role)")
      .eq("customer_id", customerId)
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  },
};

// ---------------- memory_items：结构化长记忆（key/value 画像要点）----------------
export const memory = {
  // 同 scope+ref_id+key 仅保留最新一条（uq_memory_scope_key）
  async upsert(input: {
    store_id: string;
    scope: string;
    ref_id: string;
    key: string;
    value: string;
    confidence?: number;
    source?: string;
  }) {
    const { error } = await sb()
      .from("memory_items")
      .upsert(input, { onConflict: "store_id,scope,ref_id,key" });
    if (error) throw error;
  },
  async listForCustomer(storeId: string, customerId: string) {
    const { data } = await sb()
      .from("memory_items")
      .select("key, value, confidence, source, created_at, updated_at")
      .eq("store_id", storeId)
      .eq("scope", "customer")
      .eq("ref_id", customerId)
      .order("updated_at", { ascending: false });
    return data || [];
  },
  // 门店级长记忆（store scope）：有效话术 / 难成交客户类型 / 活动反馈，反哺全店
  async listForStore(storeId: string, limit = 20) {
    const { data } = await sb()
      .from("memory_items")
      .select("key, value, confidence, source, updated_at")
      .eq("store_id", storeId)
      .eq("scope", "store")
      .eq("ref_id", storeId)
      .order("updated_at", { ascending: false })
      .limit(limit);
    return data || [];
  },
  // 员工复核客户画像记忆：确认（提升可信度）/ 否定（删除）
  async setConfidence(storeId: string, customerId: string, key: string, confidence: number) {
    await sb()
      .from("memory_items")
      .update({ confidence })
      .eq("store_id", storeId)
      .eq("scope", "customer")
      .eq("ref_id", customerId)
      .eq("key", key);
  },
  async remove(storeId: string, customerId: string, key: string) {
    await sb()
      .from("memory_items")
      .delete()
      .eq("store_id", storeId)
      .eq("scope", "customer")
      .eq("ref_id", customerId)
      .eq("key", key);
  },
};

// ---------------- growth_opportunities：增长机会（待跟进/唤醒/升单/补救）----------------
export const opportunities = {
  async create(input: Record<string, any>) {
    const { error } = await sb().from("growth_opportunities").insert(input);
    if (error) throw error;
  },
  async listOpen(storeId: string, limit = 30) {
    const { data } = await sb()
      .from("growth_opportunities")
      .select("*, customer_records(name, stage), employees(name, role)")
      .eq("store_id", storeId)
      .eq("status", "open")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  },
  async listOpenForCustomer(storeId: string, customerId: string) {
    const { data } = await sb()
      .from("growth_opportunities")
      .select("*, customer_records(name, stage)")
      .eq("store_id", storeId)
      .eq("customer_id", customerId)
      .eq("status", "open")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });
    return data || [];
  },
  // 员工工作台：分给我的 open 增长机会（机会产出时绑定了 employee_id）
  async listOpenForEmployee(storeId: string, employeeId: string, limit = 20) {
    const { data } = await sb()
      .from("growth_opportunities")
      .select("*, customer_records(name, stage)")
      .eq("store_id", storeId)
      .eq("employee_id", employeeId)
      .eq("status", "open")
      .order("priority", { ascending: false })
      .order("due_at", { ascending: true })
      .limit(limit);
    return data || [];
  },
  async findOpen(storeId: string, customerId: string, type: string) {
    const { data } = await sb()
      .from("growth_opportunities")
      .select("id")
      .eq("store_id", storeId)
      .eq("customer_id", customerId)
      .eq("type", type)
      .eq("status", "open")
      .maybeSingle();
    return data;
  },
  // 同一客户同一类型只保留一条 open：存在则更新，否则新建（应用层去重）
  async upsertOpen(input: {
    store_id: string;
    customer_id: string;
    employee_id?: string | null;
    type: string;
    title: string;
    note?: string | null;
    reason?: string | null;
    blocker?: string | null;
    opening?: string | null;
    goal?: string | null;
    priority?: number;
    due_at?: string | null;
    source?: string;
  }) {
    const existing = await this.findOpen(input.store_id, input.customer_id, input.type);
    if (existing) {
      const patch: Record<string, any> = { title: input.title };
      for (const k of ["note", "reason", "blocker", "opening", "goal", "priority", "due_at", "source"] as const) {
        if ((input as any)[k] != null) patch[k] = (input as any)[k];
      }
      await sb()
        .from("growth_opportunities")
        .update(patch)
        .eq("id", (existing as any).id)
        .eq("store_id", input.store_id);
      return;
    }
    const { error } = await sb()
      .from("growth_opportunities")
      .insert({ ...input, status: "open" });
    if (error) throw error;
  },
  async getById(id: string, storeId: string) {
    const { data } = await sb()
      .from("growth_opportunities")
      .select("*, customer_records(name, stage, personality, decision_style, spending_power, concerns, tags)")
      .eq("id", id)
      .eq("store_id", storeId)
      .maybeSingle();
    return data;
  },
  async update(id: string, storeId: string, patch: Record<string, any>) {
    await sb().from("growth_opportunities").update(patch).eq("id", id).eq("store_id", storeId);
  },
  async delete(id: string, storeId: string) {
    await sb().from("growth_opportunities").delete().eq("id", id).eq("store_id", storeId);
  },
};

export const followups = {
  async listByEmployee(storeId: string, employeeId: string, status?: string) {
    let q = sb()
      .from("followups")
      .select("*, customer_records(name, phone, stage)")
      .eq("store_id", storeId)
      .eq("employee_id", employeeId)
      .order("due_at", { ascending: true });
    if (status) q = q.eq("status", status);
    const { data } = await q;
    return data || [];
  },
  async create(input: Record<string, any>) {
    const { error } = await sb().from("followups").insert(input);
    if (error) throw error;
  },
  async update(id: string, storeId: string, patch: Record<string, any>) {
    await sb().from("followups").update(patch).eq("id", id).eq("store_id", storeId);
  },
  async countOpen(storeId: string) {
    const { count } = await sb()
      .from("followups")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId)
      .neq("status", "done");
    return count || 0;
  },
  async statsByStore(storeId: string) {
    const { data } = await sb().from("followups").select("status").eq("store_id", storeId);
    const rows = (data || []) as any[];
    const done = rows.filter((r) => r.status === "done").length;
    return { total: rows.length, done, open: rows.length - done };
  },
  // 全店待跟进（非完成），带客户与负责人，用于增长作战室
  async listOpenByStore(storeId: string, limit = 20) {
    const { data } = await sb()
      .from("followups")
      .select("*, customer_records(name, phone, stage), employees(name, role)")
      .eq("store_id", storeId)
      .neq("status", "done")
      .neq("status", "canceled")
      .order("due_at", { ascending: true })
      .limit(limit);
    return data || [];
  },
};

export const feedback = {
  async listByStore(storeId: string, limit = 20) {
    const { data } = await sb()
      .from("customer_feedback")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  },
  async create(input: Record<string, any>) {
    const { error } = await sb().from("customer_feedback").insert(input);
    if (error) throw error;
  },
};

export const consultations = {
  async create(input: Record<string, any>) {
    const { error } = await sb().from("consultation_records").insert(input);
    if (error) throw error;
  },
  async listByStore(storeId: string, limit = 50) {
    const { data } = await sb()
      .from("consultation_records")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  },
};

// ---------------- growth_playbooks：系统增长方法论 ----------------
export const playbooks = {
  async listAll(storeId: string) {
    const { data } = await sb()
      .from("growth_playbooks")
      .select("*")
      .eq("status", "active")
      .or(`store_id.is.null,store_id.eq.${storeId}`)
      .order("module", { ascending: true });
    return data || [];
  },
  // 语义检索（向量余弦）。queryLiteral 为 pgvector 字面量 '[...]'
  async matchByEmbedding(storeId: string, role: string, queryLiteral: string, count = 3) {
    const { data, error } = await sb().rpc("match_growth_playbooks", {
      p_store_id: storeId,
      p_role: role,
      p_query: queryLiteral,
      p_count: count,
    });
    if (error) throw error;
    return data || [];
  },
  async listMissingEmbedding(limit = 500) {
    const { data } = await sb()
      .from("growth_playbooks")
      .select("id, title, scene, customer_psychology, strategy, scripts, scenario_key, module")
      .eq("status", "active")
      .is("embedding", null)
      .limit(limit);
    return data || [];
  },
  async setEmbedding(id: string, embeddingLiteral: string) {
    const { error } = await sb()
      .from("growth_playbooks")
      .update({ embedding: embeddingLiteral })
      .eq("id", id);
    if (error) throw error;
  },
  // 按问题检索最相关的方法论（系统全局 + 门店自定义），按角色过滤 —— bigram 兜底
  async search(storeId: string, query: string, baseRole: string, limit = 3) {
    const { data } = await sb()
      .from("growth_playbooks")
      .select("*")
      .eq("status", "active")
      .or(`store_id.is.null,store_id.eq.${storeId}`);
    let rows = (data || []) as any[];
    rows = rows.filter(
      (r) => !r.applicable_roles?.length || r.applicable_roles.includes(baseRole)
    );
    const q = (query || "").toLowerCase();
    const grams: string[] = [];
    for (let i = 0; i < q.length - 1; i++) grams.push(q.slice(i, i + 2));
    const scored = rows
      .map((r) => {
        const text = `${r.title} ${r.scene || ""} ${r.customer_psychology || ""} ${r.scenario_key}`.toLowerCase();
        const seen = new Set<string>();
        let s = 0;
        for (const g of grams) {
          if (g.trim() && text.includes(g) && !seen.has(g)) {
            s++;
            seen.add(g);
          }
        }
        return { r, s };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, limit);
    return scored.map((x) => x.r);
  },
};

// ---------------- 会谈复盘助手 ----------------
export const meetings = {
  async create(input: Record<string, any>) {
    const { data, error } = await sb().from("meeting_sessions").insert(input).select("id").single();
    if (error) throw error;
    return data as { id: string };
  },
  async update(id: string, storeId: string, patch: Record<string, any>) {
    await sb().from("meeting_sessions").update(patch).eq("id", id).eq("store_id", storeId);
  },
  async getById(id: string, storeId: string) {
    const { data } = await sb()
      .from("meeting_sessions")
      .select("*, customer_records(name, stage, personality, decision_style, spending_power, concerns, tags), employees(name, role)")
      .eq("id", id)
      .eq("store_id", storeId)
      .maybeSingle();
    return data;
  },
  async delete(id: string, storeId: string) {
    // FK on delete cascade 会一并删 transcripts/analysis/consents/audio_files
    await sb().from("meeting_sessions").delete().eq("id", id).eq("store_id", storeId);
  },
  // 列表：全店（店长/老板）
  async listByStore(storeId: string, limit = 50) {
    const { data } = await sb()
      .from("meeting_sessions")
      .select("*, customer_records(name), employees(name, role)")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  },
  // 列表：员工自己参与的（权限：员工只看自己的）
  async listByEmployee(storeId: string, employeeId: string, limit = 50) {
    const { data } = await sb()
      .from("meeting_sessions")
      .select("*, customer_records(name), employees(name, role)")
      .eq("store_id", storeId)
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  },
  // 某客户名下的全部会谈（按时间倒序）—— 客户画像页的会谈时间线
  async listByCustomer(storeId: string, customerId: string, limit = 30) {
    const { data } = await sb()
      .from("meeting_sessions")
      .select("*, employees(name, role)")
      .eq("store_id", storeId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  },
};

export const meetingTranscripts = {
  async insertMany(rows: Record<string, any>[]) {
    if (!rows.length) return;
    const { error } = await sb().from("meeting_transcripts").insert(rows);
    if (error) throw error;
  },
  async countByMeeting(meetingId: string, storeId: string) {
    const { count } = await sb()
      .from("meeting_transcripts")
      .select("*", { count: "exact", head: true })
      .eq("meeting_id", meetingId)
      .eq("store_id", storeId);
    return count || 0;
  },
  async listByMeeting(meetingId: string, storeId: string) {
    const { data } = await sb()
      .from("meeting_transcripts")
      .select("*")
      .eq("meeting_id", meetingId)
      .eq("store_id", storeId)
      .order("seq", { ascending: true });
    return data || [];
  },
  async setSpeakerRole(meetingId: string, storeId: string, speaker: string, role: string) {
    await sb()
      .from("meeting_transcripts")
      .update({ speaker_role: role })
      .eq("meeting_id", meetingId)
      .eq("store_id", storeId)
      .eq("speaker", speaker);
  },
  async deleteByMeeting(meetingId: string, storeId: string) {
    await sb().from("meeting_transcripts").delete().eq("meeting_id", meetingId).eq("store_id", storeId);
  },
};

export const meetingAnalysis = {
  async create(input: Record<string, any>) {
    const { error } = await sb().from("meeting_analysis").insert(input);
    if (error) throw error;
  },
  async getByMeeting(meetingId: string, storeId: string) {
    const { data } = await sb()
      .from("meeting_analysis")
      .select("*")
      .eq("meeting_id", meetingId)
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .maybeSingle();
    return data;
  },
  // 老板端聚合：全店会谈分析（带场景/员工/客户）
  async listByStore(storeId: string, limit = 100) {
    const { data } = await sb()
      .from("meeting_analysis")
      .select("*, meeting_sessions(scene, created_at, status), employees(name, role), customer_records(name)")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  },
};

export const meetingConsents = {
  async create(input: Record<string, any>) {
    const { error } = await sb().from("meeting_consents").insert(input);
    if (error) throw error;
  },
};

export const audioFiles = {
  async create(input: Record<string, any>) {
    const { error } = await sb().from("audio_files").insert(input);
    if (error) throw error;
  },
  async listByMeeting(meetingId: string, storeId: string) {
    const { data } = await sb()
      .from("audio_files")
      .select("id, file_path, file_url")
      .eq("meeting_id", meetingId)
      .eq("store_id", storeId);
    return data || [];
  },
  async markDeleted(meetingId: string, storeId: string) {
    await sb()
      .from("audio_files")
      .update({ deleted_at: new Date().toISOString(), upload_status: "deleted" })
      .eq("meeting_id", meetingId)
      .eq("store_id", storeId);
  },
};

export const meetingAccessLogs = {
  async log(input: { store_id: string; meeting_id?: string; employee_id?: string; action: string }) {
    await sb().from("meeting_access_logs").insert(input);
  },
};

// 聚合导出，页面用 `import { db } from "@/lib/db"`
// ---------------- store_config：门店自定义配置（code + display_name）----------------
export const config = {
  async listByStore(storeId: string) {
    const { data } = await sb()
      .from("store_config")
      .select("*")
      .eq("store_id", storeId)
      .order("sort_order", { ascending: true });
    return data || [];
  },
  // 整类保存：先 upsert 当前项（不丢数据），再删除本次列表之外的旧项。
  // 非破坏式——upsert 失败则抛错且旧数据完整，不会出现"先删后插失败导致整类清空"。
  async replaceCategory(
    storeId: string,
    category: string,
    items: { code: string; display_name: string; enabled: boolean; visible_to_staff: boolean }[]
  ) {
    const now = new Date().toISOString();
    if (items.length) {
      const rows = items.map((it, i) => ({
        store_id: storeId,
        category,
        code: it.code,
        display_name: it.display_name,
        enabled: it.enabled,
        visible_to_staff: it.visible_to_staff,
        sort_order: i,
        updated_at: now,
      }));
      const { error } = await sb()
        .from("store_config")
        .upsert(rows, { onConflict: "store_id,category,code" });
      if (error) throw error;
    }
    // 删除被移除的旧项：查出该类现有 code，删掉「不在本次列表里」的。
    // 用 .in(数组) 明确删除，而不是 .not('code','in','(...)') 字符串过滤——后者在 PostgREST 上偶发卡住/不返回。
    const keep = new Set(items.map((it) => it.code));
    const { data: existing, error: selErr } = await sb()
      .from("store_config")
      .select("code")
      .eq("store_id", storeId)
      .eq("category", category);
    if (selErr) throw selErr;
    const toDelete = (existing || []).map((r: any) => r.code).filter((c: string) => !keep.has(c));
    if (toDelete.length) {
      const { error: delErr } = await sb()
        .from("store_config")
        .delete()
        .eq("store_id", storeId)
        .eq("category", category)
        .in("code", toDelete);
      if (delErr) throw delErr;
    }
  },
};

// ---------------- 维护：清空门店经营/测试数据（保留账号/知识库/方法论/配置）----------------
export const maintenance = {
  async clearStoreData(storeId: string) {
    // chat_messages 经 session 关联，先按 session 删 messages，再删 sessions
    const { data: sessions } = await sb().from("chat_sessions").select("id").eq("store_id", storeId);
    const sids = (sessions || []).map((s: any) => s.id);
    if (sids.length) await sb().from("chat_messages").delete().in("session_id", sids);
    // 其余按「子表先、父表后」删除；某表若无 store_id 列，Supabase 返回 error，忽略继续
    const tables = [
      "memory_items", "customer_interactions", "growth_opportunities", "followups",
      "risk_logs", "pending_questions", "knowledge_gaps", "customer_feedback",
      "consultation_records", "meeting_transcripts", "meeting_analysis",
      "meeting_access_logs", "meeting_consents", "audio_files", "meeting_sessions",
      "chat_sessions", "customer_records",
    ];
    for (const t of tables) {
      await sb().from(t).delete().eq("store_id", storeId);
    }
  },
};

export const db = {
  stores,
  users,
  employees,
  knowledge,
  chat,
  pending,
  gaps,
  risks,
  startup,
  tasks,
  banned,
  standard,
  reports,
  roles,
  announcements,
  schedules,
  campaigns,
  projects,
  customers,
  followups,
  feedback,
  consultations,
  playbooks,
  interactions,
  memory,
  opportunities,
  meetings,
  meetingTranscripts,
  meetingAnalysis,
  meetingConsents,
  audioFiles,
  meetingAccessLogs,
  config,
  maintenance,
};

export type Db = typeof db;
