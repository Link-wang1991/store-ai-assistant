"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { chatApi, customerApi, getToken, type SessionItem, type ChatMessageItem } from "@/lib/api-client";
import { QUICK_QUESTIONS, type Role } from "@/lib/constants";
import { ChatClient } from "@/components/ChatClient";
import { CoachLanding } from "@/components/CoachLanding";
import { decodeJwtPayload } from "@/lib/jwt";
import { AppLoading } from "@/components/AppLoading";

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q");
  const customerId = searchParams.get("customerId");
  const sessionIdParam = searchParams.get("sessionId");
  const isNew = searchParams.get("new");

  const [token, setToken] = useState<string | null>(null);
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [initialMessages, setInitialMessages] = useState<ChatMessageItem[]>([]);
  const [customerName, setCustomerName] = useState<string | undefined>();

  const loadSessions = async () => {
    const res = await chatApi.listSessions();
    if (res.ok && res.data) {
      setSessions(res.data);
    }
  };

  useEffect(() => {
    const t = getToken();
    if (!t) { router.replace("/login"); return; }
    setToken(t);
    try {
      setPayload(decodeJwtPayload(t));
    } catch {}

    // 加载会话列表和历史消息
    Promise.all([
      chatApi.listSessions(),
      sessionIdParam ? chatApi.listMessages(sessionIdParam) : Promise.resolve({ ok: true, data: [] } as any),
    ]).then(([sessionsRes, messagesRes]) => {
      if (sessionsRes.ok && sessionsRes.data) {
        setSessions(sessionsRes.data);
      }
      if (messagesRes.ok && messagesRes.data) {
        setInitialMessages(messagesRes.data);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [router, sessionIdParam]);

  const handleSessionDelete = async (id: string) => {
    const res = await chatApi.deleteSession(id);
    if (!res.ok) {
      alert(res.error || "删除失败");
      return;
    }
    await loadSessions();
  };

  useEffect(() => {
    if (!customerId) return;
    customerApi.detail(customerId).then(r => {
      if (r.ok && r.data) setCustomerName(r.data.name);
    });
  }, [customerId]);

  if (!token || loading) return <AppLoading label="正在连接 AI 教练…" />;

  const role = String(payload?.role || "consultant") as Role;
  const roleLabel = { owner: "老板", manager: "店长", consultant: "咨询师", beautician: "美容师", receptionist: "前台", operator: "运营" }[role] || role;

  const isLanding = !q && !customerId && !sessionIdParam && !isNew;
  if (isLanding) {
    return <CoachLanding isAdmin={String(role) === "owner" || String(role) === "manager" || String(role) === "admin"} />;
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
      sessions={sessions}
      onSessionDelete={handleSessionDelete}
    />
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<AppLoading label="正在打开 AI 教练…" />}>
      <ChatPageInner />
    </Suspense>
  );
}
