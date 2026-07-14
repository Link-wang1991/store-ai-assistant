"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getToken, customerApi } from "@/lib/api-client";
import { QUICK_QUESTIONS, type Role } from "@/lib/constants";
import { ChatClient } from "@/components/ChatClient";
import { CoachLanding } from "@/components/CoachLanding";
import { decodeJwtPayload } from "@/lib/jwt";

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q");
  const customerId = searchParams.get("customerId");
  const sessionIdParam = searchParams.get("sessionId");
  const isNew = searchParams.get("new");

  // Auth check + JWT 数据
  const [token, setToken] = useState<string | null>(null);
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 会话历史
  const [initialMessages, setInitialMessages] = useState<any[]>([]);
  const [customerName, setCustomerName] = useState<string | undefined>();

  useEffect(() => {
    const t = getToken();
    if (!t) { router.replace("/login"); return; }
    setToken(t);
    try {
      setPayload(decodeJwtPayload(t));
    } catch {}
    setLoading(false);
  }, [router]);

  // 加载客户名
  useEffect(() => {
    if (!customerId) return;
    customerApi.detail(customerId).then(r => {
      if (r.ok && r.data) setCustomerName(r.data.name);
    });
  }, [customerId]);

  if (!token || loading) return <div className="flex h-screen items-center justify-center text-sm text-slate-400">加载中…</div>;

  const role = String(payload?.role || "consultant") as Role;
  const roleLabel = { owner: "老板", manager: "店长", consultant: "咨询师", beautician: "美容师", receptionist: "前台", operator: "运营" }[role] || role;

  // AI 教练首屏
  const isLanding = !q && !customerId && !sessionIdParam && !isNew;
  if (isLanding) {
    return <CoachLanding storeName="门店 AI 经营助手" isAdmin={role === "owner" || role === "manager"} sessions={[]} />;
  }

  return (
    <ChatClient
      roleLabel={roleLabel}
      storeName="门店 AI 经营助手"
      quickQuestions={QUICK_QUESTIONS[role] || []}
      initialMessages={initialMessages}
      initialSessionId={sessionIdParam || null}
      initialQuestion={q || ""}
      customerId={customerId || undefined}
      customerName={customerName}
      sessions={[]}
    />
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-sm text-slate-400">加载中…</div>}>
      <ChatPageInner />
    </Suspense>
  );
}
