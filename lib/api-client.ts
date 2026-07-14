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
    cachedToken = localStorage.getItem("store_ai_token") || getCookie("store_ai_token");
  }
  return cachedToken;
}

/** 服务端专用：从 cookie 读取 token（Server Component 中使用） */
export async function getServerToken(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    const store = cookies();
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

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
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
};

export type ChatMessageItem = {
  id: string;
  role: "user" | "ai";
  text: string;
  riskLevel?: string;
  answerType?: string;
};

export type SessionItem = {
  id: string;
  title: string | null;
};

// -- AI 对话 --
export const chatApi = {
  ask: (question: string, sessionId?: string | null, customerId?: string) => {
    return backendApi<{
      sessionId: string; answer: string; answerType: string;
      riskLevel: string; messageId: string; retrieved: any[];
    }>("/api/chat", {
      method: "POST",
      body: { question, sessionId, customerId },
    });
  },

  listSessions: () => backendApi<SessionItem[]>("/api/chat/sessions"),

  listMessages: (sessionId: string) =>
    backendApi<ChatMessageItem[]>(`/api/chat/sessions/${sessionId}/messages`),
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
