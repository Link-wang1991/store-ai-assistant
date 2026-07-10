"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, customerApi, meetingApi } from "@/lib/api-client";
import { API_BASE_URL } from "@/lib/data-source";
import { MeetingClient } from "@/components/MeetingClient";
import { BottomNav, STAFF_NAV } from "@/components/BottomNav";
import { isAdminRole } from "@/lib/constants";
import { MAIN_NAV } from "@/components/BottomNav";
import { SCENE_LABEL } from "@/lib/scenes";
import { fmtTime } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  recording: "录音中", uploaded: "已上传", transcribing: "转写中", analyzing: "分析中", done: "已完成", failed: "失败",
};

export default function MeetingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const [myMeetings, setMyMeetings] = useState<any[]>([]);
  const [myCustomers, setMyCustomers] = useState<{ id: string; name: string }[]>([]);
  const [otherCustomers, setOtherCustomers] = useState<{ id: string; name: string }[]>([]);
  const [empId, setEmpId] = useState("");
  const [empName, setEmpName] = useState("");
  const [editMeetingId, setEditMeetingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSearch, setEditSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    const t = getToken();
    if (!t) { router.replace("/login"); return; }

    let eid = "", ename = "";
    try {
      const raw = t.split(".")[1];
      const utf8 = decodeURIComponent(escape(atob(raw)));
      const p = JSON.parse(utf8);
      setRole(p.role || "");
      eid = p.employeeId || "";
      ename = p.name || "";
      setEmpId(eid);
      setEmpName(ename);
    } catch { router.replace("/login"); return; }

    const now = Date.now();
    Promise.allSettled([
      customerApi.list(),
      meetingApi.list(),
    ]).then(([cr, mr]) => {
      if (cr.status === "fulfilled" && cr.value.ok) {
        const all = cr.value.data || [];
        setMyCustomers(all.filter((c: any) => c.assignedTo === eid).map((c: any) => ({ id: c.id, name: c.name })));
        setOtherCustomers(all.filter((c: any) => c.assignedTo !== eid).map((c: any) => ({ id: c.id, name: c.name })));
      }
      if (mr.status === "fulfilled" && mr.value.ok) {
        setMyMeetings((mr.value.data || []).filter(
          (m: any) => !(m.status === "recording" && now - new Date(m.created_at).getTime() > 10 * 60 * 1000)
        ));
      }
      setLoading(false);
    });
  }, [router]);

  const handleDelete = async (id: string, customerId?: string, customerName?: string) => {
    // 如果关联了自动创建的客户（名称以"新客户"开头），询问是否一并删除
    let delCustomer = false;
    if (customerId && customerName?.startsWith("新客户")) {
      delCustomer = confirm(`该会谈关联了一个临时客户「${customerName}」，是否同时删除该客户资料？`);
    }
    const res = await meetingApi.delete(id);
    if (res.ok) {
      if (delCustomer && customerId) {
        const t = getToken();
        await fetch(`${API_BASE_URL}/api/customers/${customerId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${t}` },
        }).catch(() => {});
      }
      setMyMeetings((prev) => prev.filter((m) => m.id !== id));
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center text-sm text-slate-400">加载中…</div>;

  const isAdmin = isAdminRole(role);
  const nav = isAdmin ? MAIN_NAV : STAFF_NAV;

  return (
    <div className="min-h-screen bg-[var(--page)] pb-20">

      {/* 顶部栏 */}
      <div className="sticky top-0 z-30 bg-white border-b border-[var(--line)] px-4 py-3">
        <div className="relative flex items-center justify-center">
          <button onClick={() => router.push("/home")} className="absolute left-0 flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--ink)] text-[15px] font-bold hover:bg-[var(--line)] transition">←</button>
          <span className="text-[15px] font-semibold text-[var(--ink)]">会谈</span>
        </div>
      </div>

      {/* 录音区 */}
      <MeetingClient myCustomers={myCustomers} otherCustomers={otherCustomers} />

      {/* 会谈记录列表 */}
      <div className="px-4 pb-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[var(--ink)]">我的会谈记录</h2>
          <span className="text-[11px] text-[var(--faint)]">共 {myMeetings.length} 条</span>
        </div>
        {myMeetings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-4 py-10 text-center">
            <p className="text-[13px] text-[var(--faint)]">还没有会谈记录</p>
            <p className="mt-1 text-[11px] text-[var(--faint)]">上方选好客户和场景，点「开始会谈记录」</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {myMeetings.map((m) => (
              <SwipeableItem key={m.id} onDelete={() => handleDelete(m.id, m.customer_id || m.customerId, m.customer_records?.name || m.customerName || m.customer_name)}>
                <Link
                  href={`/meeting/${m.id}`}
                  className="block rounded-2xl border border-[var(--line)] bg-white p-3.5 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[var(--green)]" />
                      <span className="text-[14px] font-medium text-[var(--ink)]">
                        {editMeetingId === m.id ? (
                          <span className="relative inline-block">
                            <input value={editName} onChange={e => setEditName(e.target.value)}
                              className="w-32 rounded-lg border border-[var(--line)] px-2 py-0.5 text-[12px] outline-none focus:border-[var(--green)]"
                              placeholder="客户姓名" autoFocus onKeyDown={e => {
                                if (e.key === "Escape") setEditMeetingId(null);
                                if (e.key === "Enter") {
                                  const t = getToken();
                                  fetch(`${API_BASE_URL}/api/customers/${m.customer_id || m.customerId}/update`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
                                    body: JSON.stringify({ name: editName }),
                                  }).then(() => window.location.reload());
                                }
                              }} />
                            <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-xl border border-[var(--line)] bg-white p-2 shadow-lg">
                              <p className="mb-1 text-[10px] text-[var(--faint)]">关联已有客户：</p>
                              <input value={editSearch} onChange={e => setEditSearch(e.target.value)}
                                placeholder="搜索…" className="mb-1 w-full rounded-lg border border-[var(--line)] px-2 py-1 text-[11px] outline-none" />
                              <div className="max-h-36 space-y-0.5 overflow-y-auto">
                                {myCustomers.filter(c => !editSearch || c.name.includes(editSearch)).length > 0 && (
                                  <><p className="text-[9px] text-[var(--faint)] px-1 pt-1">我的客户</p>
                                  {myCustomers.filter(c => !editSearch || c.name.includes(editSearch)).slice(0, 4).map(c => (
                                    <button key={c.id} onClick={() => {
                                      const t = getToken();
                                      fetch(`${API_BASE_URL}/api/meetings/${m.id}`, {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
                                        body: JSON.stringify({ customer_id: c.id }),
                                      }).then(() => window.location.reload());
                                    }} className="w-full rounded-lg px-2 py-1 text-left text-[11px] hover:bg-[var(--surface-2)]">{c.name}</button>
                                  ))}</>
                                )}
                                {otherCustomers.filter(c => !editSearch || c.name.includes(editSearch)).length > 0 && (
                                  <><p className="text-[9px] text-[var(--faint)] px-1 pt-1">其他客户</p>
                                  {otherCustomers.filter(c => !editSearch || c.name.includes(editSearch)).slice(0, 4).map(c => (
                                    <button key={c.id} onClick={() => {
                                      const t = getToken();
                                      fetch(`${API_BASE_URL}/api/meetings/${m.id}`, {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
                                        body: JSON.stringify({ customer_id: c.id }),
                                      }).then(() => window.location.reload());
                                    }} className="w-full rounded-lg px-2 py-1 text-left text-[11px] hover:bg-[var(--surface-2)]">{c.name}</button>
                                  ))}</>
                                )}
                              </div>
                              <button onClick={() => setEditMeetingId(null)}
                                className="mt-1 w-full rounded-full border border-[var(--line)] py-1 text-[10px] text-[var(--muted)]">关闭</button>
                            </div>
                          </span>
                        ) : (
                          <button onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditMeetingId(m.id);
                            setEditName(m.customer_records?.name || m.customerName || m.customer_name || "临时客户");
                          }} className="underline decoration-dotted underline-offset-2 hover:text-[var(--green)] transition">
                            {m.customer_records?.name || m.customerName || m.customer_name || "临时客户"}
                          </button>
                        )}
                      </span>
                      <span className="rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                        {SCENE_LABEL[m.scene] || m.scene}
                      </span>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                      m.status === "done" ? "bg-[var(--green-soft)] text-[var(--green-dark)]" :
                      m.status === "failed" ? "bg-[var(--red-soft)] text-[var(--red)]" :
                      "bg-[var(--yellow-soft)] text-[var(--yellow)]"
                    }`}>
                      {STATUS_LABEL[m.status] || m.status}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[var(--faint)]">
                    <span>{fmtTime(m.created_at)}</span>
                    {empName && <span>· {empName}</span>}
                  </div>
                </Link>
              </SwipeableItem>
            ))}
          </div>
        )}
      </div>

      <BottomNav items={nav} />
    </div>
  );
}

/** 左滑显示删除按钮 */
function SwipeableItem({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [swiping, setSwiping] = useState(false);
  const startX = useRef(0);
  const offsetX = useRef(0);
  const [deleting, setDeleting] = useState(false);

  const THRESHOLD = 70;

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    offsetX.current = 0;
    setSwiping(true);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swiping) return;
    const dx = startX.current - e.touches[0].clientX;
    offsetX.current = dx;
    if (dx > THRESHOLD && !open) setOpen(true);
    else if (dx < 10 && open) setOpen(false);
  };
  const handleTouchEnd = () => {
    setSwiping(false);
  };
  const handleMouseDown = (e: React.MouseEvent) => {
    startX.current = e.clientX;
    setSwiping(true);
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!swiping || !e.buttons) return;
    const dx = startX.current - e.clientX;
    if (dx > THRESHOLD && !open) setOpen(true);
    else if (dx < 10 && open) setOpen(false);
  };
  const handleMouseUp = () => {
    setSwiping(false);
  };
  const doDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    await onDelete();
  };

  return (
    <div className="relative overflow-hidden" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      <div className="transition-transform" style={{ transform: open ? "translateX(-72px)" : "translateX(0)" }}>
        {children}
      </div>
      {open && (
        <button
          onClick={doDelete}
          disabled={deleting}
          className="absolute right-0 top-0 flex h-full w-[68px] items-center justify-center rounded-2xl bg-red-500 text-[12px] font-medium text-white disabled:opacity-50"
        >
          {deleting ? "删除中" : "删除"}
        </button>
      )}
    </div>
  );
}
