"use client";

import { setToken } from "@/lib/api-client";

export function LogoutButton({ className = "" }: { className?: string }) {
  return (
    <button
      className={className || "text-sm text-red-500"}
      onClick={() => {
        setToken(null);
        window.location.href = "/login";
      }}
    >
      退出登录
    </button>
  );
}
