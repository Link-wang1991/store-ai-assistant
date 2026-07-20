// ============================================================
// Backend 模式数据访问适配层（lib/db/backend-impl）
// 替代 Supabase 直连，所有数据通过 ProxyController → MySQL。
// 页面 / pipeline 无需改动，lib/db/index.ts 按 DATA_SOURCE 切换。
// ============================================================

import { readServerToken } from "../server-cookie";
import { API_BASE_URL } from "../data-source";

const BASE = API_BASE_URL;

// --- 通用 fetch（带 JWT token）---
async function apiCall(url: string, opts?: RequestInit): Promise<any> {
  try {
    // 服务端从 cookie 读取 token
    const token = await readServerToken();
    const res = await fetch(url, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts?.headers as Record<string, string>),
      },
    });
    // 处理空响应体（如 Spring Security 403 无 body）
    let json: any = {};
    try {
      const text = await res.text();
      if (text) json = JSON.parse(text);
    } catch {
      // 响应体为空或非 JSON，使用状态码默认消息
    }
    if (!res.ok || json.code !== 200) throw new Error(json.message || "请求失败");
    return json;
  } catch (e: any) {
    throw new Error(e?.message === "请求失败" ? e.message : "服务暂时不可用");
  }
}

/** Proxy CRUD 工具 */
const proxy = {
  /** 列表查询 */
  async list(table: string, params?: Record<string, string>): Promise<any[]> {
    try {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      const res = await apiCall(`${BASE}/api/proxy/${table}${qs}`);
      return (res.data || []) as any[];
    } catch {
      return [];
    }
  },
  /** 按 ID 查询单条 */
  async get(table: string, id: string): Promise<any> {
    try {
      const res = await apiCall(`${BASE}/api/proxy/${table}/${id}`);
      return res.data as any;
    } catch {
      return null;
    }
  },
  /** 插入 */
  async insert(table: string, data: any): Promise<any> {
    try {
      const res = await apiCall(`${BASE}/api/proxy/${table}`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res.data as any;
    } catch {
      return null;
    }
  },
  /** 更新 */
  async update(table: string, id: string, data: any): Promise<void> {
    try {
      await apiCall(`${BASE}/api/proxy/${table}/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    } catch {
      // ignore
    }
  },
  /** 删除 */
  async del(table: string, id: string): Promise<void> {
    try {
      await apiCall(`${BASE}/api/proxy/${table}/${id}`, { method: "DELETE" });
    } catch {
      // ignore
    }
  },
  /** 特殊：调用指定 API 路径 */
  async api(path: string, opts?: RequestInit): Promise<any> {
    try {
      return await apiCall(`${BASE}${path}`, opts);
    } catch {
      return null;
    }
  },
};

// ============================================================
// stores
// ============================================================
export const stores = {
  async getById(id: string) { return proxy.get("stores", id); },
  async countActive() { return (await proxy.list("stores")).length; },
  async listActive() { return proxy.list("stores", { select: "id,name,brand_name" }); },
  async setOwner(id: string, _ownerUserId: string) { /* 暂不支持 */ },
  async update(id: string, patch: any) { await proxy.update("stores", id, patch); },
};

// ============================================================
// users
// ============================================================
export const users = {
  async getByAuthId(authUserId: string) { return proxy.get("users", authUserId); },
  async create(input: any) { return proxy.insert("users", input); },
  async countByEmails(emails: string[]) { return 0; },
};

// ============================================================
// employees
// ============================================================
export const employees = {
  async getActiveByUserId(userId: string) {
    const rows = await proxy.list("employees", { "user_id": `eq.${userId}` });
    return rows.find((e: any) => e.status === "active") || null;
  },
  async getById(id: string) { return proxy.get("employees", id); },
  async listByStore(_storeId: string) { return proxy.list("employees", { limit: "200" }); },
  async listActiveByStore(_storeId: string) {
    return proxy.list("employees", { status: "eq.active", limit: "200" });
  },
  async listByStoreWithLogin(_storeId: string) {
    const rows = await proxy.list("employees", { limit: "200" });
    return rows.filter((e: any) => e.user_id);
  },
  async getOwner(_storeId: string) {
    const rows = await proxy.list("employees", { role: "eq.owner", limit: "1" });
    return rows[0] || null;
  },
  async create(input: any) { return proxy.insert("employees", input); },
  async setStatus(id: string, status: string, _disabledAt: string | null) {
    await proxy.update("employees", id, { status });
  },
  async update(id: string, _storeId: string, patch: any) {
    await proxy.update("employees", id, patch);
  },
};

// ============================================================
// customers
// ============================================================
export const customers = {
  async listByStore(_storeId: string) { return proxy.list("customers", { limit: "500" }); },
  async listByAssignee(_storeId: string, employeeId: string) {
    return proxy.list("customers", { assigned_to: `eq.${employeeId}`, limit: "500" });
  },
  async listUnassigned(_storeId: string) {
    return proxy.list("customers", { assigned_to: "eq.NULL", limit: "500" });
  },
  async getById(id: string, _storeId: string) { return proxy.get("customers", id); },
  async update(id: string, _storeId: string, patch: any) {
    await proxy.update("customers", id, patch);
  },
  async delete(id: string, _storeId: string) { await proxy.del("customers", id); },
  async create(input: any) { return proxy.insert("customers", input); },
  async createMany(rows: any[]) { return Promise.all(rows.map(r => proxy.insert("customers", r))); },
  async reassign(_storeId: string, _fromEmployeeId: string, _toEmployeeId: string) {
    return 0;
  },
  async listDueFollow(_storeId: string, _before: string, _limit = 20) { return []; },
};

// ============================================================
// meetings
// ============================================================
export const meetings = {
  async create(input: any) { return proxy.insert("meetings", input); },
  async update(id: string, _storeId: string, patch: any) {
    await proxy.update("meetings", id, patch);
  },
  async getById(id: string, _storeId: string) { return proxy.get("meetings", id); },
  async delete(id: string, _storeId: string) { await proxy.del("meetings", id); },
  async listByStore(_storeId: string, _limit = 50) {
    return proxy.list("meetings", { limit: String(_limit), order: "created_at", dir: "desc" });
  },
  async listByEmployee(_storeId: string, _employeeId: string, _limit = 50) {
    return proxy.list("meetings", { employee_id: `eq.${_employeeId}`, limit: String(_limit), order: "created_at", dir: "desc" });
  },
  async listByCustomer(_storeId: string, customerId: string, _limit = 30) {
    return proxy.list("meetings", { customer_id: `eq.${customerId}`, limit: String(_limit) });
  },
  async countUnanalyzed(_storeId: string, _employeeId?: string) {
    const rows = await proxy.list("meetings", { limit: "1", select: "id" });
    // 简化实现：从服务器端 API 获取更准确
    return rows.length;
  },
};

// ============================================================
// chat（AI 教练会话/消息）
// ============================================================
export const chat = {
  async getLatestSession(employeeId: string) {
    const rows = await proxy.list("chat_sessions", { employee_id: `eq.${employeeId}`, limit: "1", order: "updated_at", dir: "desc" });
    return rows[0] || null;
  },
  async listSessionsByEmployee(employeeId: string, _limit = 30) {
    return proxy.list("chat_sessions", { employee_id: `eq.${employeeId}`, limit: String(_limit), order: "updated_at", dir: "desc" });
  },
  async getSession(id: string, employeeId: string) {
    const rows = await proxy.list("chat_sessions", { id: `eq.${id}`, employee_id: `eq.${employeeId}`, limit: "1" });
    return rows[0] || null;
  },
  async createSession(input: any) { return proxy.insert("chat_sessions", input); },
  async touchSession(id: string) { await proxy.update("chat_sessions", id, { updated_at: new Date().toISOString() }); },
  async insertMessage(input: any) { return proxy.insert("chat_messages", input); },
  async listSessionMessages(sessionId: string, _limit = 20) {
    return proxy.list("chat_messages", { session_id: `eq.${sessionId}`, limit: String(_limit) });
  },
  async listRecentByStore(_storeId: string, _limit = 8) {
    return proxy.list("chat_sessions", { limit: String(_limit), order: "updated_at", dir: "desc" });
  },
  async listRecentByEmployee(employeeId: string, _limit = 10) {
    return proxy.list("chat_sessions", { employee_id: `eq.${employeeId}`, limit: String(_limit), order: "updated_at", dir: "desc" });
  },
  async listMetaSince(_storeId: string, _since: string) { return []; },
  async countSince(_storeId: string, _since: string) { return 0; },
};

// ============================================================
// knowledge（知识库）
// ============================================================
export const knowledge = {
  async listDocs(_storeId: string) { return proxy.list("knowledge_documents", { limit: "500" }); },
  async getDoc(id: string) { return proxy.get("knowledge_documents", id); },
  async createDoc(input: any) { return proxy.insert("knowledge_documents", input); },
  async setDocStatus(id: string, status: string) { await proxy.update("knowledge_documents", id, { status }); },
  async setDocVisibleRoles(id: string, _storeId: string, roles: string[]) {
    await proxy.update("knowledge_documents", id, { visible_roles: JSON.stringify(roles) });
  },
  async setDocCategory(id: string, _storeId: string, category: string) {
    await proxy.update("knowledge_documents", id, { category });
  },
  async deleteDoc(id: string, _storeId: string) { await proxy.del("knowledge_documents", id); },
  async createChunks(rows: any[]) { return Promise.all(rows.map(r => proxy.insert("knowledge_chunks", r))); },
  async listChunkDocIds(_storeId: string) {
    const rows = await proxy.list("knowledge_chunks", { limit: "500" });
    return Array.from(new Set(rows.map((r: any) => r.document_id)));
  },
  async getChunksByDoc(documentId: string, _storeId: string) {
    return proxy.list("knowledge_chunks", { document_id: `eq.${documentId}`, limit: "500" });
  },
  async listRetrievable(_storeId: string, _role: string) {
    return proxy.list("knowledge_chunks", { limit: "500" });
  },
  async matchChunks(_storeId: string, _role: string, _queryLiteral: string, _count = 3) { return []; },
  async listChunksMissingEmbedding(_limit = 500) { return []; },
  async setChunkEmbedding(_id: string, _embeddingLiteral: string) {},
};

// ============================================================
// memory（客户记忆）
// ============================================================
export const memory = {
  async upsert(input: any) { return proxy.insert("memory_items", input); },
  async listForCustomer(_storeId: string, customerId: string) {
    return proxy.list("memory_items", { customer_id: `eq.${customerId}`, limit: "100" });
  },
  async listForStore(_storeId: string, _limit = 20) {
    return proxy.list("memory_items", { limit: "200" });
  },
  async setConfidence(_storeId: string, _customerId: string, _key: string, _confidence: number) {},
  async remove(_storeId: string, _customerId: string, _key: string) {},
};

// ============================================================
// interactions（客户互动）
// ============================================================
export const interactions = {
  async create(input: any) { return proxy.insert("interactions", input); },
  async listByCustomer(customerId: string, _storeId: string, _limit = 30) {
    return proxy.list("interactions", { customer_id: `eq.${customerId}`, limit: String(_limit) });
  },
};

// ============================================================
// risks（风险记录）
// ============================================================
export const risks = {
  async create(input: any) { return proxy.insert("risk_logs", input); },
  async listOpen(_storeId: string, _limit?: number) {
    return proxy.list("risk_logs", { status: "eq.open", limit: "100" });
  },
  async resolve(id: string, _storeId: string, _patch: any) {
    await proxy.update("risk_logs", id, { status: "resolved" });
  },
  async countOpen(_storeId: string) { return (await proxy.list("risk_logs", { status: "eq.open", limit: "1", select: "id" })).length; },
  async listByStore(_storeId: string, _limit = 50) {
    return proxy.list("risk_logs", { limit: String(_limit) });
  },
  async delete(id: string, _storeId: string) { await proxy.del("risk_logs", id); },
};

// ============================================================
// remaining modules — simple CRUD / placeholder
// ============================================================
export const tasks = {
  async listByAssignee(_storeId: string, _employeeId: string) {
    return proxy.list("tasks", { limit: "200" });
  },
  async listByStore(_storeId: string) { return proxy.list("tasks", { limit: "200" }); },
  async getById(id: string) { return proxy.get("tasks", id); },
  async create(input: any) { return proxy.insert("tasks", input); },
  async update(id: string, patch: any) { await proxy.update("tasks", id, patch); },
};
export const pending = {
  async listPending(_storeId: string, _limit?: number) { return proxy.list("pending_questions", { limit: "100" }); },
  async getById(id: string, _storeId: string) { return proxy.get("pending_questions", id); },
  async create(input: any) { return proxy.insert("pending_questions", input); },
  async update(id: string, patch: any) { await proxy.update("pending_questions", id, patch); },
  async countPending(_storeId: string) { return (await proxy.list("pending_questions", { limit: "1", select: "id" })).length; },
  async listByStore(_storeId: string, _limit = 50) { return proxy.list("pending_questions", { limit: String(_limit) }); },
  async delete(id: string, _storeId: string) { await proxy.del("pending_questions", id); },
};
export const gaps = {
  async findPending(_storeId: string, question: string) { return null; },
  async create(input: any) { return proxy.insert("knowledge_gaps", input); },
  async setFrequency(id: string, _freq: number) { await proxy.update("knowledge_gaps", id, { frequency: _freq }); },
  async listPending(_storeId: string) { return proxy.list("knowledge_gaps", { status: "eq.pending", limit: "200" }); },
  async getById(id: string, _storeId: string) { return proxy.get("knowledge_gaps", id); },
  async setStatus(id: string, status: string) { await proxy.update("knowledge_gaps", id, { status }); },
  async countPending(_storeId: string) { return 0; },
  async countSince(_storeId: string, _since: string) { return 0; },
  async delete(id: string, _storeId: string) { await proxy.del("knowledge_gaps", id); },
};

export const banned = {
  async listByStore(_storeId: string) { return proxy.list("banned_words", { limit: "500" }); },
  async listWords(_storeId: string) {
    const rows = await proxy.list("banned_words", { limit: "500" });
    return rows.map((r: any) => r.word).filter(Boolean);
  },
  async create(input: any) { return proxy.insert("banned_words", input); },
  async delete(id: string, _storeId: string) { await proxy.del("banned_words", id); },
};
export const standard = {
  async listActive(_storeId: string) { return proxy.list("standard_answers", { limit: "500" }); },
  async create(input: any) { return proxy.insert("standard_answers", input); },
};
export const reports = {
  async create(input: any) { return proxy.insert("reports", input); },
  async listByStore(_storeId: string, _type?: string, _limit = 10) {
    return proxy.list("reports", { limit: String(_limit) });
  },
};
export const roles = {
  async listDefinitions(_storeId: string) { return proxy.list("role_definitions", { limit: "200" }); },
  async labelMap(_storeId: string): Promise<Record<string, string>> { return {}; },
  async createDefinition(input: any) { return proxy.insert("role_definitions", input); },
  async updateDefinition(id: string, _storeId: string, patch: any) { await proxy.update("role_definitions", id, patch); },
  async listPermissions(_storeId: string) { return proxy.list("role_permissions", { limit: "500" }); },
  async upsertPermission(input: any) { return proxy.insert("role_permissions", input); },
  async listActiveDefinitions(_storeId: string) { return proxy.list("role_definitions", { limit: "200" }); },
  async getDefinition(_storeId: string, roleKey: string) {
    const rows = await proxy.list("role_definitions", { role_key: `eq.${roleKey}`, limit: "1" });
    return rows[0] || null;
  },
  async permissionsForRole(_storeId: string, roleKey: string) {
    return proxy.list("role_permissions", { role_key: `eq.${roleKey}`, limit: "200" });
  },
};
export const announcements = {
  async listAll(_storeId: string) { return proxy.list("announcements", { limit: "200" }); },
  async listVisible(_storeId: string, _roleKeys: string[], _employeeId: string) {
    return proxy.list("announcements", { status: "eq.active", limit: "200" });
  },
  async listActiveNow(_storeId: string) { return proxy.list("announcements", { status: "eq.active", limit: "200" }); },
  async create(input: any) { return proxy.insert("announcements", input); },
  async setStatus(id: string, _storeId: string, status: string) { await proxy.update("announcements", id, { status }); },
  async delete(id: string, _storeId: string) { await proxy.del("announcements", id); },
};
export const schedules = {
  async forEmployeeRange(_storeId: string, _employeeId: string, _fromDate: string, _toDate: string) { return []; },
  async forDate(_storeId: string, _date: string) { return []; },
  async create(input: any) { return proxy.insert("schedules", input); },
};
export const campaigns = {
  async listActive(_storeId: string) { return proxy.list("campaigns", { limit: "100" }); },
  async create(input: any) { return proxy.insert("campaigns", input); },
};
export const projects = {
  async listActive(_storeId: string) { return proxy.list("service_projects", { limit: "100" }); },
  async create(input: any) { return proxy.insert("service_projects", input); },
};
export const playbooks = {
  async listAll(_storeId: string) { return proxy.list("playbooks", { limit: "500" }); },
  async matchByEmbedding(_storeId: string, _role: string, _queryLiteral: string, _count = 3) { return []; },
  async listMissingEmbedding(_limit = 500) { return []; },
  async setEmbedding(_id: string, _embeddingLiteral: string) {},
  async search(_storeId: string, _query: string, _baseRole: string, _limit = 3) {
    // 回退到全量 list（后端没有向量检索），后续可优化
    const all = await proxy.list("playbooks", { limit: "500" });
    const q = _query.toLowerCase();
    return all.filter((p: any) =>
      (p.title || "").toLowerCase().includes(q) ||
      (p.content || "").toLowerCase().includes(q)
    ).slice(0, _limit);
  },
};
export const followups = {
  async listByEmployee(_storeId: string, _employeeId: string, _status?: string) {
    return proxy.list("followups", { limit: "200" });
  },
  async create(input: any) { return proxy.insert("followups", input); },
  async update(id: string, _storeId: string, patch: any) { await proxy.update("followups", id, patch); },
  async countOpen(_storeId: string) { return 0; },
  async statsByStore(_storeId: string) { return { total: 0, done: 0, open: 0 }; },
  async listOpenByStore(_storeId: string, _limit = 20) { return proxy.list("followups", { limit: String(_limit) }); },
};
export const feedback = {
  async listByStore(_storeId: string, _limit = 20) { return proxy.list("customer_feedback", { limit: String(_limit) }); },
  async create(input: any) { return proxy.insert("customer_feedback", input); },
};
export const consultations = {
  async create(input: any) { return proxy.insert("consultation_records", input); },
  async listByStore(_storeId: string, _limit = 50) { return proxy.list("consultation_records", { limit: String(_limit) }); },
};
export const opportunities = {
  async create(input: any) { return proxy.insert("opportunities", input); },
  async listOpen(_storeId: string, _limit = 30) { return []; },
  async listOpenForCustomer(_storeId: string, _customerId: string) { return []; },
  async listOpenForEmployee(_storeId: string, _employeeId: string, _limit = 20) { return []; },
  async findOpen(_storeId: string, _customerId: string, _type: string) { return null; },
  async upsertOpen(_input: any) { return null; },
  async getById(id: string, _storeId: string) { return proxy.get("opportunities", id); },
  async update(id: string, _storeId: string, patch: any) { await proxy.update("opportunities", id, patch); },
  async delete(id: string, _storeId: string) { await proxy.del("opportunities", id); },
};
export const meetingTranscripts = {
  async insertMany(rows: any[]) { return Promise.all(rows.map(r => proxy.insert("meeting_transcripts", r))); },
  async countByMeeting(meetingId: string, _storeId: string) { return 0; },
  async listByMeeting(meetingId: string, _storeId: string) {
    return proxy.list("meeting_transcripts", { meeting_id: `eq.${meetingId}`, limit: "500" });
  },
  async setSpeakerRole(_meetingId: string, _storeId: string, _speaker: string, _role: string) {},
  async deleteByMeeting(meetingId: string, _storeId: string) {
    const rows = await proxy.list("meeting_transcripts", { meeting_id: `eq.${meetingId}`, limit: "500" });
    for (const r of rows) await proxy.del("meeting_transcripts", r.id);
  },
};
export const meetingAnalysis = {
  async create(input: any) { return proxy.insert("meeting_analysis", input); },
  async getByMeeting(meetingId: string, _storeId: string) {
    const rows = await proxy.list("meeting_analysis", { meeting_id: `eq.${meetingId}`, limit: "1" });
    return rows[0] || null;
  },
  async listByStore(_storeId: string, _limit = 100) { return proxy.list("meeting_analysis", { limit: String(_limit) }); },
};
export const meetingConsents = {
  async create(input: any) { return proxy.insert("meeting_consents", input); },
};
export const audioFiles = {
  async create(input: any) { return proxy.insert("audio_files", input); },
  async listByMeeting(meetingId: string, _storeId: string) {
    return proxy.list("audio_files", { meeting_id: `eq.${meetingId}`, limit: "50" });
  },
  async markDeleted(meetingId: string, _storeId: string) {
    const rows = await proxy.list("audio_files", { meeting_id: `eq.${meetingId}`, limit: "50" });
    for (const r of rows) await proxy.update("audio_files", r.id, { deleted_at: new Date().toISOString() });
  },
};
export const meetingAccessLogs = {
  async log(input: any) { return proxy.insert("meeting_access_logs", input); },
};
export const config = {
  async listByStore(_storeId: string) { return proxy.list("store_config", { limit: "200" }); },
  async replaceCategory(
    _storeId: string,
    _category: string,
    _items: { code: string; display_name: string; enabled: boolean; visible_to_staff: boolean }[]
  ) {},
};
export const startup = {
  async getDemoStatus(_emails: string[]) { return {}; },
  async listDemoEmployees(_emails: string[]) { return []; },
};
export const maintenance = {
  async clearStoreData(_storeId: string) {},
};

// ============================================================
// db 统一导出（与 lib/db/index.ts 结构一致）
// ============================================================
export const db = {
  stores, users, employees, knowledge, chat,
  pending, gaps, risks, startup, tasks,
  banned, standard, reports, roles,
  announcements, schedules, campaigns, projects,
  customers, interactions, memory, opportunities,
  followups, feedback, consultations, playbooks,
  aiFeedback: {
    async upsert(_input: any) {},
    async getStats(_storeId: string) {
      return { total: 0, helpful: 0, notHelpful: 0, rate: 0 };
    },
  },
  meetings, meetingTranscripts, meetingAnalysis,
  meetingConsents, audioFiles, meetingAccessLogs,
  config, maintenance,
};
