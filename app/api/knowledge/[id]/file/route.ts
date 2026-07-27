import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/data-source";
import { readServerToken } from "@/lib/server-cookie";

/** 同源转发本机知识原件，浏览器不会直接接触 Spring 地址、JWT 或磁盘路径。 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await readServerToken();
  if (!token) return NextResponse.json({ message: "未登录" }, { status: 401 });

  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api/knowledge/${encodeURIComponent(id)}/file`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "原文件服务暂不可用" }, { status: 502 });
  }

  const headers = new Headers();
  for (const key of ["content-type", "content-disposition", "cache-control"]) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
