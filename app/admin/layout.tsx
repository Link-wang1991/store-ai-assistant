"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api-client";
import { decodeJwtPayload } from "@/lib/jwt";
import { AppLoading } from "@/components/AppLoading";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = getToken();
    if (!t) { router.replace("/login"); return; }
    const p = decodeJwtPayload(t);
    if (!p) { router.replace("/login"); return; }
    if (p.role !== "owner" && p.role !== "manager" && p.role !== "admin") { router.replace("/work"); return; }
    setReady(true);
  }, [router]);

  if (!ready) return <AppLoading label="正在验证管理权限…" />;

  return (
    <div className="admin-shell min-h-screen">
      {children}
    </div>
  );
}
