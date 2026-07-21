"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { chatApi, customerApi, getToken, type SessionItem, type ChatMessageItem } from "@/lib/api-client";
import { QUICK_QUESTIONS, type Role } from "@/lib/constants";
import { ChatClient } from "@/components/ChatClient";
import { ClassicChatClient } from "@/components/ClassicChatClient";
import { CoachLanding } from "@/components/CoachLanding";
import { ClassicCoachLanding } from "@/components/ClassicCoachLanding";
import { decodeJwtPayload } from "@/lib/jwt";
import { AppLoading } from "@/components/AppLoading";

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q");
  const customerId = searchParams.get("customerId");
  const sessionIdParam = searchParams.get("sessionId");
  const isNew = searchParams.get("new");
  const view = searchParams.get("view");

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

  const sessionCustomerId = sessionIdParam
    ? sessions.find((session) => session.id === sessionIdParam)?.customerId || undefined
    : undefined;
  const effectiveCustomerId = customerId || sessionCustomerId;

  useEffect(() => {
    setCustomerName(undefined);
    if (!effectiveCustomerId) return;
    customerApi.detail(effectiveCustomerId).then(r => {
      if (r.ok && r.data) setCustomerName(r.data.name);
    });
  }, [effectiveCustomerId]);

  if (!token || loading) return <AppLoading label="正在连接 AI 教练…" />;

  const role = String(payload?.role || "consultant") as Role;
  const roleLabel = { owner: "老板", manager: "店长", consultant: "咨询师", beautician: "美容师", receptionist: "前台", operator: "运营" }[role] || role;

  const isLanding = !q && !customerId && !sessionIdParam && !isNew;
  if (isLanding) {
    if (view === "classic") {
      return <ClassicCoachLanding storeName="门店 AI 经营助手" isAdmin={String(role) === "owner" || String(role) === "manager" || String(role) === "admin"} sessions={sessions} onSessionDelete={handleSessionDelete} />;
    }
    return <CoachLanding mode={view === "classic" ? "classic" : "workbench"} isAdmin={String(role) === "owner" || String(role) === "manager" || String(role) === "admin"} />;
  }

  if (view === "classic") {
    return (
      <ClassicChatClient
        roleLabel={roleLabel}
        quickQuestions={QUICK_QUESTIONS[role] || []}
        initialMessages={initialMessages}
        initialSessionId={sessionIdParam || null}
        initialQuestion={q || ""}
        customerId={effectiveCustomerId}
        customerName={customerName}
        sessions={sessions}
        onSessionDelete={handleSessionDelete}
      />
    );
  }

  return (
    <ChatClient
      roleLabel={roleLabel}
      storeName="门店 AI 经营助手"
      quickQuestions={QUICK_QUESTIONS[role] || []}
      initialMessages={initialMessages}
      initialSessionId={sessionIdParam || null}
      initialQuestion={q || ""}
      customerId={effectiveCustomerId}
      customerName={customerName}
      sessions={sessions}
      onSessionDelete={handleSessionDelete}
      view={view === "classic" ? "classic" : "workbench"}
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
