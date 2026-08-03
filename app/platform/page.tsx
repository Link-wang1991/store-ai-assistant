"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getToken } from "@/lib/api-client";

type StoreSummary = {
  id: string;
  name: string;
  employeeCount: number;
  customerCount: number;
  meetingCount: number;
  createdAt: string;
};

export default function PlatformPage() {
  const [role, setRole] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initMsg, setInitMsg] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", ownerName: "", ownerPhone: "", ownerPassword: "" });
  const [creating, setCreating] = useState(false);

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const token = getToken();
    const res = await fetch(`/api/backend${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
    });
    const json = await res.json();
    if (json.code !== 200) throw new Error(json.message || "请求失败");
    return json.data as T;
  }

  async function load() {
    setLoading(true);
    try {
      const me = await api<{ role: string }>("/api/auth/me");
      setRole(me.role);
      if (me.role !== "super_admin") {
        setLoading(false);
        return;
      }
      const list = await api<StoreSummary[]>("/api/super-admin/stores");
      setStores(list);
    } catch (e: any) {
      setError(e?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api("/api/super-admin/stores", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ name: "", ownerName: "", ownerPhone: "", ownerPassword: "" });
      setInitMsg("门店创建成功，已自动初始化咨询场景与知识库");
      await load();
    } catch (e: any) {
      setError(e?.message || "创建失败");
    } finally {
      setCreating(false);
    }
  }

  async function onInit(storeId: string) {
    setInitMsg(null);
    try {
      await api(`/api/super-admin/stores/${storeId}/init`, { method: "POST" });
      setInitMsg("已初始化该门店的咨询场景与知识库");
    } catch (e: any) {
      setError(e?.message || "初始化失败");
    }
  }

  if (loading) {
    return <div className="ref-main px-4 py-10 text-center text-[#6c7b6d]">加载中…</div>;
  }

  if (role !== "super_admin") {
    return (
      <div className="ref-main flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <p className="text-[15px] font-semibold text-[#161d17]">无权限访问</p>
        <p className="mt-2 text-[13px] text-[#6c7b6d]">平台管理仅对超级管理员开放。</p>
        <Link href="/home" className="mt-4 rounded-lg bg-[#006d37] px-4 py-2 text-[13px] font-semibold text-white">返回首页</Link>
      </div>
    );
  }

  return (
    <div className="ref-main space-y-6 p-4 pb-20">
      <header className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-[18px] font-bold text-[#161d17]">平台管理</h1>
          <p className="text-[12px] text-[#6c7b6d]">门店录入、初始化与跨门店概览</p>
        </div>
        <Link href="/home" className="text-[13px] text-[#006d37]">返回</Link>
      </header>

      {initMsg && <p className="rounded-lg bg-[#eef6ec] px-3 py-2 text-[12px] text-[#006d37]">{initMsg}</p>}
      {error && <p className="rounded-lg bg-[#fdecec] px-3 py-2 text-[12px] text-[#c0392b]">{error}</p>}

      {/* 创建门店 */}
      <section className="ref-card">
        <h2 className="mb-3 text-[14px] font-bold text-[#161d17]">录入新门店</h2>
        <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2">
          <input className="auth-input" placeholder="门店名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="auth-input" placeholder="负责人姓名" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} required />
          <input className="auth-input" placeholder="负责人手机号" value={form.ownerPhone} onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })} required />
          <input className="auth-input" type="text" placeholder="初始密码（≥6 位）" value={form.ownerPassword} onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })} required />
          <button type="submit" disabled={creating} className="app-primary-button py-2.5 text-[13px] disabled:opacity-60 sm:col-span-2">
            {creating ? "创建中…" : "创建门店并录入负责人"}
          </button>
        </form>
      </section>

      {/* 门店列表 */}
      <section>
        <h2 className="mb-3 text-[14px] font-bold text-[#161d17]">门店列表（{stores.length}）</h2>
        <div className="space-y-3">
          {stores.map((s) => (
            <article key={s.id} className="ref-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-bold text-[#161d17]">{s.name}</h3>
                  <p className="mt-0.5 text-[11px] text-[#6c7b6d]">创建于 {s.createdAt?.slice(0, 10) || "-"}</p>
                </div>
                <button onClick={() => onInit(s.id)} className="shrink-0 rounded-lg border border-[#cfe0d1] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#006d37]">
                  初始化资料
                </button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[#eef2ee] pt-3 text-center">
                <div><div className="text-[16px] font-bold text-[#161d17]">{s.employeeCount}</div><div className="text-[11px] text-[#6c7b6d]">员工</div></div>
                <div><div className="text-[16px] font-bold text-[#161d17]">{s.customerCount}</div><div className="text-[11px] text-[#6c7b6d]">客户</div></div>
                <div><div className="text-[16px] font-bold text-[#161d17]">{s.meetingCount}</div><div className="text-[11px] text-[#6c7b6d]">会谈</div></div>
              </div>
            </article>
          ))}
          {stores.length === 0 && <p className="text-[13px] text-[#6c7b6d]">暂无门店</p>}
        </div>
      </section>
    </div>
  );
}
