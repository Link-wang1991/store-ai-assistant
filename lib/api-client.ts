// ============================================================
// 统一 API 客户端（仅后端模式）
// ============================================================

import { API_BASE_URL } from "./data-source";

// ============================================================
// Token 管理
// ============================================================

let cachedToken: string | null = null;

function getCookie(name: string): string | null {
  if (typeof window === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function getToken(): string | null {
  if (cachedToken) return cachedToken;
  if (typeof window !== "undefined") {
    // 免密跳转由服务端更新 cookie；不能让旧 localStorage 令牌覆盖新会话。
    cachedToken = getCookie("store_ai_token") || localStorage.getItem("store_ai_token");
  }
  return cachedToken;
}

/** 服务端专用：从 cookie 读取 token（Server Component 中使用） */
export async function getServerToken(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return store.get("store_ai_token")?.value ?? null;
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  cachedToken = token;
  if (typeof window !== "undefined") {
    if (token) {
      localStorage.setItem("store_ai_token", token);
      document.cookie = `store_ai_token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
    } else {
      localStorage.removeItem("store_ai_token");
      document.cookie = "store_ai_token=; path=/; max-age=0";
    }
  }
}

// ============================================================
// 通用 fetch 封装（backend 模式）
// ============================================================

async function backendApi<T>(
  path: string,
  options: Omit<RequestInit, "body"> & { body?: any } = {}
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // 防止后端未就绪时 fetch 永久挂起导致页面一直转圈
  const controller = new AbortController();
  const timeoutMs = 10000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : options.body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const json = await res.json();
    if (json.code === 200) {
      return { ok: true, data: json.data as T };
    }
    return { ok: false, error: json.message || `请求失败(${res.status})` };
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === "AbortError") {
      return { ok: false, error: "请求超时，请确认后端服务(8080)已启动" };
    }
    return { ok: false, error: e?.message || "网络错误" };
  }
}

// ============================================================
// 业务 API
// ============================================================

// -- 认证 --
export type RegisterData = {
  token: string;
  userId: string;
  employeeId: string;
  storeId: string;
  role: string;
  roleLabel: string;
  storeName: string;
  name: string;
};

export const authApi = {
  async login(email: string, password: string) {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (!res.ok || json.code !== 200) {
      return { ok: false, error: json.message || "登录失败" } as const;
    }
    return {
      ok: true,
      data: {
        token: json.data?.token || "",
        userId: json.data?.userId || "",
        employeeId: json.data?.employeeId || "",
        storeId: json.data?.storeId || "",
        role: json.data?.role || "",
        roleLabel: json.data?.roleLabel || "",
        storeName: json.data?.storeName || "",
        name: json.data?.name || "",
      },
    } as const;
  },

  async register(email: string, password: string, name: string, storeName: string) {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, storeName }),
    });
    const json = await res.json();
    if (!res.ok || json.code !== 200) {
      return { ok: false, error: json.message || "注册失败" } as const;
    }
    return {
      ok: true,
      data: {
        token: json.data?.token || "",
        userId: json.data?.userId || "",
        employeeId: json.data?.employeeId || "",
        storeId: json.data?.storeId || "",
        role: json.data?.role || "",
        roleLabel: json.data?.roleLabel || "",
        storeName: json.data?.storeName || "",
        name: json.data?.name || "",
      },
    } as const;
  },

  me: () => backendApi<{
    userId: string;
    employeeId: string;
    storeId: string;
    role: string;
    roleLabel: string;
    email: string;
    name: string;
    storeName: string;
  }>("/api/auth/me"),
};

export type SwitchableAccount = {
  employeeId: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  entry: string;
};

/**
 * 管理者查看本门店已创建的可登录账号。
 * 仅返回身份信息，不返回密码；切换仍需输入目标账号密码并走正常登录接口。
 */
export const employeeAccountApi = {
  listSwitchable: () => backendApi<SwitchableAccount[]>("/api/admin/employees/switchable"),
  previewLogin: (employeeId: string) => backendApi<{
    token: string;
    userId: string;
    employeeId: string;
    storeId: string;
    role: string;
    roleLabel: string;
    storeName: string;
    name: string;
    preview: boolean;
  }>(`/api/admin/employees/${encodeURIComponent(employeeId)}/preview-login`, { method: "POST" }),
};

// -- 知识库 --
export const knowledgeApi = {
  list: (category?: string) => {
    return backendApi<any[]>(
      `/api/knowledge${category ? `?category=${encodeURIComponent(category)}` : ""}`
    );
  },

  search: (q: string, topN = 5) => {
    return backendApi<any[]>(
      `/api/knowledge/search?q=${encodeURIComponent(q)}&topN=${topN}`
    );
  },

  upload: (formData: FormData) => {
    const token = getToken();
    return fetch(`${API_BASE_URL}/api/knowledge/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }).then(r => r.json());
  },

  toggle: (id: string) => {
    return backendApi<void>(`/api/knowledge/${id}/toggle`, { method: "POST" });
  },

  delete: (id: string) => {
    return backendApi<void>(`/api/knowledge/${id}/delete`, { method: "POST" });
  },

  reindexEmbeddings: () => {
    return backendApi<{ total: number; indexed: number; failed: number; model: string }>(
      "/api/knowledge/reindex-embeddings", { method: "POST" },
    );
  },
};

// -- 会谈经验审核 --
export type ExperienceReviewItem = {
  id: string;
  title: string;
  content: string;
  status: string;
  sourceType?: string | null;
  sourceId?: string | null;
  sourceMeetingId?: string | null;
  submittedByName?: string | null;
  createdAt?: string | null;
};

export const experienceReviewApi = {
  listPending: () => backendApi<ExperienceReviewItem[]>("/api/experience-reviews"),
  submit: (input: { meetingId: string; title: string; content: string; category?: string }) =>
    backendApi<{ status: string; task_id?: string; message?: string }>("/api/experience-reviews/submit", {
      method: "POST",
      body: input,
    }),
  approve: (id: string, input: { title: string; category: string; content: string; visibleRoles: string[] }) =>
    backendApi<{ document_id: string; status: string }>(`/api/experience-reviews/${encodeURIComponent(id)}/approve`, {
      method: "POST",
      body: input,
    }),
  reject: (id: string, reason: string) =>
    backendApi<{ status: string }>(`/api/experience-reviews/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      body: { reason },
    }),
};

export type ChatMessageItem = {
  id: string;
  role: "user" | "ai";
  text: string;
  riskLevel?: string;
  answerType?: string;
  feedbackType?: string | null;
  retrieved?: { chunkId?: string; documentId?: string; documentTitle?: string; snippet: string }[];
  methodology?: { id?: string; scenarioKey?: string; title: string; module?: string; source?: string }[];
  actionProposal?: AiActionProposal | null;
};

export type AiActionProposal = {
  id: string;
  customerId?: string | null;
  actionType: string;
  title: string;
  content: string;
  assignedTo?: string | null;
  priority?: "normal" | "high" | "urgent" | string;
  dueAt?: string | null;
  status: "pending" | "applied" | "rejected" | string;
  appliedTaskId?: string | null;
  /** 正式待办的实时闭环状态，供原 AI 建议回看执行结果。 */
  appliedTaskStatus?: string | null;
  appliedTaskFeedback?: string | null;
  appliedTaskUpdatedAt?: string | null;
};

export type ActionProposalAssignee = { id: string; name: string; role: string };

export type SessionItem = {
  id: string;
  title: string | null;
  customerId?: string | null;
};

// -- AI 对话 --
export const chatApi = {
  ask: (question: string, sessionId?: string | null, customerId?: string) => {
    return backendApi<{
      sessionId: string; answer: string; answerType: string;
      riskLevel: string; messageId: string;
      retrieved: { chunkId?: string; documentId?: string; documentTitle?: string; snippet: string }[];
      methodology: { id?: string; scenarioKey?: string; title: string; module?: string; source?: string }[];
    }>("/api/chat", {
      method: "POST",
      body: { question, sessionId, customerId },
    });
  },

  listSessions: () => backendApi<SessionItem[]>("/api/chat/sessions"),

  listMessages: (sessionId: string) =>
    backendApi<ChatMessageItem[]>(`/api/chat/sessions/${sessionId}/messages`),

  deleteSession: (sessionId: string) =>
    backendApi<void>(`/api/chat/sessions/${sessionId}`, { method: "DELETE" }),

  feedback: (messageId: string, feedbackType: string, comment?: string) =>
    backendApi<{ feedbackType: string; helpful: boolean }>(
      `/api/chat/messages/${encodeURIComponent(messageId)}/feedback`,
      { method: "POST", body: { feedbackType, comment } },
    ),

  createActionProposal: (messageId: string) =>
    backendApi<AiActionProposal>(`/api/chat/messages/${encodeURIComponent(messageId)}/action-proposals`, {
      method: "POST",
    }),

  updateActionProposal: (proposalId: string, input: Pick<AiActionProposal, "title" | "content" | "assignedTo" | "priority" | "dueAt">) =>
    backendApi<AiActionProposal>(`/api/chat/action-proposals/${encodeURIComponent(proposalId)}`, {
      method: "PATCH",
      body: input,
    }),

  actionProposalAssignees: () =>
    backendApi<ActionProposalAssignee[]>("/api/chat/action-proposals/assignees"),

  applyActionProposal: (proposalId: string) =>
    backendApi<AiActionProposal>(`/api/chat/action-proposals/${encodeURIComponent(proposalId)}/apply`, {
      method: "POST",
    }),

  rejectActionProposal: (proposalId: string) =>
    backendApi<AiActionProposal>(`/api/chat/action-proposals/${encodeURIComponent(proposalId)}/reject`, {
      method: "POST",
    }),
};

// -- 客户 --
export const customerApi = {
  list: () => backendApi<any[]>("/api/customers"),
  detail: (id: string) => backendApi<any>(`/api/customers/${id}`),
  update: (id: string, data: any) =>
    backendApi<any>(`/api/customers/${id}/update`, { method: "POST", body: data }),
};

// -- 任务 --
export const taskApi = {
  list: (status?: string) => {
    const path = `/api/tasks${status ? `?status=${status}` : ""}`;
    return backendApi<any[]>(path);
  },
  create: (task: any) => backendApi<any>("/api/tasks", { method: "POST", body: task }),
  updateStatus: (id: string, status: string) =>
    backendApi<any>(`/api/tasks/${id}/status?status=${status}`, { method: "POST" }),
  complete: (id: string, outcome: string, note?: string) =>
    backendApi<{ task_id: string; outcome: string; next_action: string }>(`/api/tasks/${id}/complete`, {
      method: "POST", body: { outcome, note },
    }),
};

// -- 首页工作台 --
// 首页必须使用和任务/客户同一条可追溯数据链；不要再拼接多套前端临时统计。
export type HomeOverview = {
  customers: any[];
  tasks: any[];
  pending_experience_reviews: number;
};

export const homeApi = {
  overview: () => backendApi<HomeOverview>("/api/home/overview"),
};

/** 低可信度会谈记忆必须由负责人确认、修正或拒绝，不能走普通“完成任务”。 */
export const memoryConfirmationApi = {
  confirm: (taskId: string, confirmed: boolean, correctedValue?: string) =>
    backendApi<{ analysis_id: string; key: string; confirmed: boolean }>(
      `/api/memory-confirmations/${encodeURIComponent(taskId)}/confirm`,
      { method: "POST", body: { confirmed, correctedValue: correctedValue || undefined } },
    ),
};

// -- 会谈 --
export const meetingApi = {
  list: () => backendApi<any[]>("/api/meetings"),
  countUnanalyzed: () => backendApi<{ count: number }>("/api/meetings/unanalyzed-count"),
  create: (customerId: string, scene: string) =>
    backendApi<any>("/api/meetings", { method: "POST", body: { customerId, scene } }),
  delete: (id: string) =>
    backendApi<void>(`/api/meetings/${id}/delete`, { method: "POST" }),
};

// -- 演示数据 → 真实数据切换（仅老板） --
export type StoreDataPreview = {
  counts: Record<string, number>;
  totalRows: number;
  confirmationPhrase: string;
  preservedData: string[];
  backupLocation: string;
};

export type StoreDataBackup = {
  fileName: string;
  createdAt: string;
  totalRows: number;
  counts: Record<string, number>;
  backupLocation: string;
};

export type StoreDataClearResult = {
  removed: Record<string, number>;
  totalRows: number;
  backup: StoreDataBackup;
  preservedData: string[];
};

export const dataLifecycleApi = {
  preview: () => backendApi<StoreDataPreview>("/api/admin/data-reset/preview"),
  backup: () => backendApi<StoreDataBackup>("/api/admin/data-reset/backup", { method: "POST" }),
  clear: (confirmation: string) =>
    backendApi<StoreDataClearResult>("/api/admin/data-reset/clear", {
      method: "POST",
      body: { confirmation },
    }),
};
