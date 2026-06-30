"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api-client";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    // 简单判断：包含 owner/manager 跳管理后台，否则跳工作台
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const role = payload.role || "";
      router.replace(role === "owner" || role === "manager" ? "/admin" : "/work");
    } catch {
      router.replace("/work");
    }
  }, [router]);

  return null;
}
