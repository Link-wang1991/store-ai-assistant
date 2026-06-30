// ============================================================
// Spring Boot 后端 API 客户端
// 替代原有的 lib/db 直连和 lib/actions Server Actions
// ============================================================

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

// JWT Token 管理
let cachedToken: string | null = null;

export function setToken(token: string | null) {
  cachedToken = token;
  if (typeof window !== "undefined") {
    if (token) {
      localStorage.setItem("store_ai_token", token);
      // 同时设置 cookie 给 middleware 读取（有效期 7 天）
      document.cookie = `store_ai_token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
    } else {
      localStorage.removeItem("store_ai_token");
      document.cookie = "store_ai_token=; path=/; max-age=0";
    }
  }
}

export function getToken(): string | null {
  if (cachedToken) return cachedToken;
  if (typeof window !== "undefined") {
    cachedToken = localStorage.getItem("store_ai_token");
  }
  return cachedToken;
}

// 通用 fetch 封装
async function api<T>(
  path: string,
  options: RequestInit & { body?: any } = {}
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : options.body,
    });
    const json = await res.json();
    if (json.code === 200) {
      return { ok: true, data: json.data as T };
    }
    return { ok: false, error: json.message || "请求失败" };
  } catch (e: any) {
    return { ok: false, error: e.message || "网络错误" };
  }
}

// ============================================================
// 业务 API
// ============================================================

// -- 认证 --
export const authApi = {
  login: (email: string, password: string) =>
    api<{ token: string; userId: string; employeeId: string; storeId: string; role: string; roleLabel: string; storeName: string }>(
      "/api/auth/login", { method: "POST", body: { email, password } }
    ),
};

// -- 知识库 --
export const knowledgeApi = {
  list: (category?: string) =>
    api<any[]>(`/api/knowledge${category ? `?category=${encodeURIComponent(category)}` : ""}`),

  search: (q: string, topN = 5) =>
    api<any[]>(`/api/knowledge/search?q=${encodeURIComponent(q)}&topN=${topN}`),

  upload: (formData: FormData) => {
    const token = getToken();
    return fetch(`${BASE_URL}/api/knowledge/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }).then(r => r.json());
  },

  toggle: (id: string) =>
    api<void>(`/api/knowledge/${id}/toggle`, { method: "POST" }),

  delete: (id: string) =>
    api<void>(`/api/knowledge/${id}/delete`, { method: "POST" }),
};

// -- AI 对话 --
export const chatApi = {
  ask: (question: string, sessionId?: string | null, customerId?: string) =>
    api<{ sessionId: string; answer: string; answerType: string; riskLevel: string; messageId: string; retrieved: any[] }>(
      "/api/chat", { method: "POST", body: { question, sessionId, customerId } }
    ),
};

// -- 客户 --
export const customerApi = {
  list: () => api<any[]>("/api/customers"),
  detail: (id: string) => api<any>(`/api/customers/${id}`),
  update: (id: string, data: any) =>
    api<any>(`/api/customers/${id}/update`, { method: "POST", body: data }),
};

// -- 任务 --
export const taskApi = {
  list: (status?: string) =>
    api<any[]>(`/api/tasks${status ? `?status=${status}` : ""}`),
  create: (task: any) =>
    api<any>("/api/tasks", { method: "POST", body: task }),
  updateStatus: (id: string, status: string) =>
    api<any>(`/api/tasks/${id}/status?status=${status}`, { method: "POST" }),
};

// -- 会谈 --
export const meetingApi = {
  list: () => api<any[]>("/api/meetings"),
  create: (customerId: string, scene: string) =>
    api<any>("/api/meetings", { method: "POST", body: { customerId, scene } }),
  delete: (id: string) =>
    api<void>(`/api/meetings/${id}/delete`, { method: "POST" }),
};

export default api;
