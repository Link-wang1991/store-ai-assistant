import { NextRequest, NextResponse } from "next/server";
import { BACKEND_API_BASE_URL } from "@/lib/data-source";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ path: string[] }> };

/**
 * 浏览器到 Java 后端的同源桥接。
 * 手机访问局域网网页时，`localhost:8080` 是手机自身而不是 Mac，因此所有
 * 客户端 API 均通过此处转发。优先使用 HTTP-only 同源 cookie 的令牌，避免
 * 旧 localStorage 令牌覆盖刚完成的免密登录。
 */
async function proxyToBackend(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const target = new URL(`${BACKEND_API_BASE_URL.replace(/\/$/, "")}/${path.map(encodeURIComponent).join("/")}`);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const accept = request.headers.get("accept");
  if (contentType) headers.set("content-type", contentType);
  if (accept) headers.set("accept", accept);
  const cookieToken = request.cookies.get("store_ai_token")?.value;
  const callerAuthorization = request.headers.get("authorization");
  if (cookieToken) headers.set("authorization", `Bearer ${cookieToken}`);
  else if (callerAuthorization) headers.set("authorization", callerAuthorization);

  const hasBody = !["GET", "HEAD"].includes(request.method);
  try {
    // 音频可接近 60MB。必须流式转发，不能先 request.arrayBuffer() 再请求 Java
    // 后端，否则手机上传会在 Next 进程中多复制一份文件，极易造成超时或内存中断。
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      ...(hasBody ? { duplex: "half" as const } : {}),
      cache: "no-store",
    } as RequestInit & { duplex?: "half" });
    const responseHeaders = new Headers();
    for (const key of ["content-type", "content-disposition", "cache-control"]) {
      const value = upstream.headers.get(key);
      if (value) responseHeaders.set(key, value);
    }
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json({ code: 503, message: "本机后端服务不可用，请确认电脑上的门店助手仍在运行" }, { status: 503 });
  }
}

export const GET = proxyToBackend;
export const POST = proxyToBackend;
export const PUT = proxyToBackend;
export const PATCH = proxyToBackend;
export const DELETE = proxyToBackend;
