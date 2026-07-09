"use client";

import HomePage from "@/components/HomePage";
import { STAFF_NAV } from "@/components/BottomNav";

export default function Home() {
  return <HomePage navItems={STAFF_NAV} />;
}
