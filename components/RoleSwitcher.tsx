"use client";

import { useEffect, useState } from "react";
import { listDemoSwitchAccounts } from "@/lib/actions";

// 仅演示模式启用：登录后在任意页面一键切换角色，无需回登录页。
const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

type Account = { name: string; roleLabel: string; email: string; entry: string };

export function RoleSwitcher() {
  return null;
}
