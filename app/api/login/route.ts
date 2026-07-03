// ============================================================
// POST /api/login — 统一登录入口
//
// Supabase 模式：Supabase Auth 登录 → 设置 session cookies
//                → 同时设置 store_ai_token cookie（含角色/门店信息）
//                供客户端 getToken() 和 middleware 使用
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "老板", manager: "店长", consultant: "咨询师",
  beautician: "美容师", receptionist: "前台", operator: "运营",
};

/**
 * 构建兼容的 store_ai_token（伪 JWT 格式，让现有代码 atob 解码仍能工作）
 */
function buildStoreToken(payload: Record<string, any>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = Buffer.from("store-ai-supabase").toString("base64url");
  return `${header}.${body}.${sig}`;
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400 });
  }

  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const next = safeNext(typeof body?.next === "string" ? body.next : null);
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "请输入邮箱和密码" }, { status: 400 });
  }

  // === Supabase Auth 登录 ===
  const cookieRecords: { name: string; value: string; options?: any }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookieRecords.push(...cookiesToSet);
        },
      },
    }
  );

  const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 401 });
  }

  // === 查询用户信息并设置 store_ai_token ===
  let userInfo: any = {
    token: "supabase",
    userId: "",
    employeeId: "",
    storeId: "",
    role: "consultant",
    roleLabel: "员工",
    storeName: "门店",
  };

  try {
    const sb = supabaseAdmin();
    const authUserId = authData.user?.id;
    if (authUserId) {
      const { data: userRow } = await sb
        .from("users")
        .select("id, name, email")
        .eq("auth_user_id", authUserId)
        .maybeSingle();

      if (userRow) {
        const { data: emp } = await sb
          .from("employees")
          .select("id, store_id, role, name")
          .eq("user_id", userRow.id)
          .eq("status", "active")
          .maybeSingle();

        if (emp) {
          const { data: store } = await sb
            .from("stores")
            .select("name")
            .eq("id", emp.store_id)
            .maybeSingle();

          const payload = {
            userId: userRow.id,
            employeeId: emp.id,
            storeId: emp.store_id,
            role: emp.role,
            roleLabel: ROLE_LABELS[emp.role] || emp.role,
            storeName: store?.name || "门店",
            email: userRow.email,
            name: emp.name || userRow.name || "",
          };

          const token = buildStoreToken(payload);
          userInfo = { token, ...payload };
        }
      }
    }
  } catch (err) {
    console.error("[login] Failed to fetch user info:", err);
  }

  // === 构建响应 ===
  const response = NextResponse.json({ ok: true, next, ...userInfo });

  // 设置 Supabase session cookies
  cookieRecords.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  // 设置 store_ai_token cookie（让现有 getToken()/middleware 兼容）
  if (userInfo.token && userInfo.token !== "supabase") {
    response.cookies.set("store_ai_token", userInfo.token, {
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
      sameSite: "lax",
      httpOnly: false,
    });
  }

  return response;
}
