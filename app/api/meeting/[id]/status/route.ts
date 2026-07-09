import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { getServerToken } from "@/lib/api-client";
import { API_BASE_URL } from "@/lib/data-source";

export const runtime = "nodejs";
export const maxDuration = 300;

// 调用后端处理会谈状态机（转写 → 分析 → 完成）
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const token = await getServerToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/meetings/${params.id}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = await res.json();
    if (data.code !== 200) {
      return NextResponse.json({ error: data.message || "处理失败" }, { status: 500 });
    }
    return NextResponse.json(data.data || { status: "transcribing" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "状态查询失败" }, { status: 500 });
  }
}
