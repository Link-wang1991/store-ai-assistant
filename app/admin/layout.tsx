"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api-client";
import { BottomNav, ADMIN_NAV } from "@/components/BottomNav";
import { decodeJwtPayload } from "@/lib/jwt";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = getToken();
    if (!t) { router.replace("/login"); return; }
    const p = decodeJwtPayload(t);
    if (!p) { router.replace("/login"); return; }
    if (p.role !== "owner" && p.role !== "manager") { router.replace("/work"); return; }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="min-h-screen pb-16">
      {children}
      <BottomNav items={ADMIN_NAV} />
    </div>
  );
}
