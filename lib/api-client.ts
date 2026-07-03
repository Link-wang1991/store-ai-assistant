// ============================================================
// 统一 API 客户端（双模式门面）
//
// 通过 NEXT_PUBLIC_DATA_SOURCE 切换数据源：
//   supabase → 前端直连 Supabase（无需部署后端，省钱）
//   backend  → 走 Spring Boot 后端代理
//
// 页面和组件无需感知当前模式，所有切换在本层透明完成。
// ============================================================

import { DATA_SOURCE, API_BASE_URL, isSupabaseMode } from "./data-source";
import { createSupabaseBrowser } from "./supabase/client";

// ============================================================
// Token 管理（兼容两种模式）
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
    // 优先从 localStorage 读取（backend 模式），其次从 cookie 读取
    cachedToken = localStorage.getItem("store_ai_token") || getCookie("store_ai_token");
  }
  return cachedToken;
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
      // Supabase 模式下同时登出 Supabase
      if (isSupabaseMode()) {
        createSupabaseBrowser().auth.signOut().catch(() => {});
      }
    }
  }
}

// ============================================================
// 通用 fetch 封装（backend 模式）
// ============================================================

async function backendApi<T>(
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
// Supabase 模式 fetch 封装（调用 Next.js Route Handlers）
// ============================================================

async function supabaseApi<T>(
  path: string,
  options: RequestInit & { body?: any } = {}
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  try {
    const res = await fetch(path, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : options.body,
    });
    const json = await res.json();
    if (json.code === 200 || json.ok) {
      return { ok: true, data: (json.data || json) as T };
    }
    return { ok: false, error: json.message || json.error || "请求失败" };
  } catch (e: any) {
    return { ok: false, error: e.message || "网络错误" };
  }
}

// ============================================================
// 业务 API（自动根据 DATA_SOURCE 路由）
// ============================================================

// -- 认证 --
export const authApi = {
  async login(email: string, password: string) {
    if (isSupabaseMode()) {
      // Supabase 模式：调用 Next.js /api/login Route Handler
      // login route 已完成 Supabase Auth + 用户信息查询 + cookie 设置
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!json.ok) {
        return { ok: false, error: json.error || "登录失败" } as const;
      }
      // login route 返回 token + 用户信息，格式与 backend 模式一致
      return {
        ok: true,
        data: {
          token: json.token || "",
          userId: json.userId || "",
          employeeId: json.employeeId || "",
          storeId: json.storeId || "",
          role: json.role || "",
          roleLabel: json.roleLabel || "",
          storeName: json.storeName || "",
        },
      } as const;
    }

    // Backend 模式：调用 Spring Boot
    return backendApi<{
      token: string; userId: string; employeeId: string; storeId: string;
      role: string; roleLabel: string; storeName: string;
    }>("/api/auth/login", { method: "POST", body: { email, password } });
  },
};

// -- 知识库 --
export const knowledgeApi = {
  list: (category?: string) => {
    if (isSupabaseMode()) {
      return supabaseApi<any[]>(
        `/api/knowledge${category ? `?category=${encodeURIComponent(category)}` : ""}`
      );
    }
    return backendApi<any[]>(
      `/api/knowledge${category ? `?category=${encodeURIComponent(category)}` : ""}`
    );
  },

  search: (q: string, topN = 5) => {
    if (isSupabaseMode()) {
      // Supabase 模式下走 Next.js knowledge route（list 接口过滤）
      return supabaseApi<any[]>(
        `/api/knowledge?q=${encodeURIComponent(q)}&topN=${topN}`
      );
    }
    return backendApi<any[]>(
      `/api/knowledge/search?q=${encodeURIComponent(q)}&topN=${topN}`
    );
  },

  upload: (formData: FormData) => {
    if (isSupabaseMode()) {
      // Supabase 模式暂不走 api route，上传走 Server Actions
      return fetch("/api/knowledge/upload", {
        method: "POST",
        body: formData,
      }).then(r => r.json());
    }
    const token = getToken();
    return fetch(`${API_BASE_URL}/api/knowledge/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }).then(r => r.json());
  },

  toggle: (id: string) => {
    const path = `/api/knowledge/${id}/toggle`;
    if (isSupabaseMode()) return supabaseApi<void>(path, { method: "POST" });
    return backendApi<void>(path, { method: "POST" });
  },

  delete: (id: string) => {
    const path = `/api/knowledge/${id}/delete`;
    if (isSupabaseMode()) return supabaseApi<void>(path, { method: "POST" });
    return backendApi<void>(path, { method: "POST" });
  },
};

// -- AI 对话 --
export const chatApi = {
  ask: (question: string, sessionId?: string | null, customerId?: string) => {
    if (isSupabaseMode()) {
      return supabaseApi<{
        sessionId: string; answer: string; answerType: string;
        riskLevel: string; messageId: string; retrieved: any[];
      }>("/api/chat", {
        method: "POST",
        body: { question, sessionId, customerId },
      });
    }
    return backendApi<{
      sessionId: string; answer: string; answerType: string;
      riskLevel: string; messageId: string; retrieved: any[];
    }>("/api/chat", {
      method: "POST",
      body: { question, sessionId, customerId },
    });
  },
};

// -- 客户 --
export const customerApi = {
  list: () => {
    if (isSupabaseMode()) return supabaseApi<any[]>("/api/customers");
    return backendApi<any[]>("/api/customers");
  },
  detail: (id: string) => {
    if (isSupabaseMode()) return supabaseApi<any>(`/api/customers/${id}`);
    return backendApi<any>(`/api/customers/${id}`);
  },
  update: (id: string, data: any) => {
    if (isSupabaseMode()) {
      return supabaseApi<any>(`/api/customers/${id}/update`, { method: "POST", body: data });
    }
    return backendApi<any>(`/api/customers/${id}/update`, { method: "POST", body: data });
  },
};

// -- 任务 --
export const taskApi = {
  list: (status?: string) => {
    const path = `/api/tasks${status ? `?status=${status}` : ""}`;
    if (isSupabaseMode()) return supabaseApi<any[]>(path);
    return backendApi<any[]>(path);
  },
  create: (task: any) => {
    const path = "/api/tasks";
    if (isSupabaseMode()) return supabaseApi<any>(path, { method: "POST", body: task });
    return backendApi<any>(path, { method: "POST", body: task });
  },
  updateStatus: (id: string, status: string) => {
    const path = `/api/tasks/${id}/status?status=${status}`;
    if (isSupabaseMode()) return supabaseApi<any>(path, { method: "POST" });
    return backendApi<any>(path, { method: "POST" });
  },
};

// -- 会谈 --
export const meetingApi = {
  list: () => {
    if (isSupabaseMode()) return supabaseApi<any[]>("/api/meetings");
    return backendApi<any[]>("/api/meetings");
  },
  create: (customerId: string, scene: string) => {
    const path = "/api/meetings";
    if (isSupabaseMode()) {
      return supabaseApi<any>(path, { method: "POST", body: { customerId, scene } });
    }
    return backendApi<any>(path, { method: "POST", body: { customerId, scene } });
  },
  delete: (id: string) => {
    const path = `/api/meetings/${id}/delete`;
    if (isSupabaseMode()) return supabaseApi<void>(path, { method: "POST" });
    return backendApi<void>(path, { method: "POST" });
  },
};

export default supabaseApi;
