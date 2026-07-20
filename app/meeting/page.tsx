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
import { decodeJwtPayload } from "@/lib/jwt";
import { Brand } from "@/components/Brand";
import { AppLoading } from "@/components/AppLoading";

const STATUS_LABEL: Record<string, string> = {
  recording: "录音中", queued: "排队提交", submitting: "提交转写中", uploaded: "已上传", transcribing: "转写中", analyzing: "分析中", done: "已完成", failed: "失败",
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
    const p = decodeJwtPayload(t);
    if (!p) { router.replace("/login"); return; }
    setRole(p.role || "");
    eid = p.employeeId || "";
    ename = p.name || "";
    setEmpId(eid);
    setEmpName(ename);

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

  if (loading) return <AppLoading label="正在整理会谈记录…" />;

  const isAdmin = isAdminRole(role);
  const nav = isAdmin ? MAIN_NAV : STAFF_NAV;

  return (
    <div className="ref-app">
      <div className="ref-canvas">
      <header className="ref-topbar">
        <Brand />
        <button onClick={() => router.push("/customers")} className="ref-icon-button" aria-label="搜索客户"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="11" cy="11" r="7"/><path d="m20 20-4.2-4.2"/></svg></button>
      </header>

      {/* 录音区 */}
      <MeetingClient myCustomers={myCustomers} otherCustomers={otherCustomers} />

      {/* 会谈记录列表 */}
      <section className="px-4 pb-4 pt-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="ref-section-title">近期会谈记录</h2>
          <span className="text-[12px] font-semibold text-[#718077]">共 {myMeetings.length} 条</span>
        </div>
        {myMeetings.length === 0 ? (
          <div className="ref-empty">
            <p>还没有会谈记录</p>
            <p className="mt-1 text-[11px]">上方选好客户和场景，点「开始录音会谈」</p>
          </div>
        ) : (
          <div className="space-y-3">
            {myMeetings.map((m) => (
              <SwipeableItem key={m.id} onDelete={() => handleDelete(m.id, m.customer_id || m.customerId, m.customer_records?.name || m.customerName || m.customer_name)}>
                <Link
                  href={`/meeting/${m.id}`}
                  className="ref-card ref-history-card ref-card-lift block"
                >
                  <span className={`ref-history-icon ${m.status === "done" ? "green" : m.status === "failed" ? "red" : m.status === "analyzing" ? "purple" : "gold"}`} aria-hidden="true"><MeetingStatusIcon status={m.status} /></span>
                  <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#078a4c]" />
                      <span className="ref-history-title truncate">
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
                      <span className="rounded-md bg-[#f1f5f1] px-1.5 py-0.5 text-[10px] text-[#68756c]">
                        {SCENE_LABEL[m.scene] || m.scene}
                      </span>
                    </div>
                    <span className={`ref-status ${
                      m.status === "done" ? "ref-status-green" :
                      m.status === "failed" ? "ref-status-red" :
                      m.status === "analyzing" ? "ref-status-purple" : "ref-status-yellow"
                    }`}>
                      {STATUS_LABEL[m.status] || m.status}
                    </span>
                    {m.status === "done" && typeof (m.quality_score ?? m.qualityScore) === "number" && (
                      <span className="ref-status ref-status-blue">
                        质量分 {m.quality_score ?? m.qualityScore}
                      </span>
                    )}
                  </div>
                  {m.status === "failed" && m.fail_reason && (
                    <p className="mt-2 text-[11px] leading-relaxed text-[#d84436]">{m.fail_reason}</p>
                  )}
                  <div className="ref-history-meta">
                    <span>{fmtTime(m.created_at)}</span>
                    {empName && <span>• {empName}</span>}
                  </div>
                  {m.status === "analyzing" && <div className="ref-progress"><i style={{ width: "66%" }} /></div>}
                  </div>
                </Link>
              </SwipeableItem>
            ))}
          </div>
        )}
      </section>

      <BottomNav items={nav} />
      </div>
    </div>
  );
}

function MeetingStatusIcon({ status }: { status: string }) {
  const common = { viewBox: "0 0 24 24", className: "h-5 w-5", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (status === "done") return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="m8.4 12.1 2.3 2.4 5-5.2" /></svg>;
  if (status === "failed") return <svg {...common}><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v4M12 16h.01" /></svg>;
  if (status === "analyzing") return <svg {...common}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /><circle cx="12" cy="12" r="3.5" /></svg>;
  return <svg {...common}><path d="M8 3h8M8 21h8" /><path d="M8 3c0 4 3 4.5 4 6 1 1.5 4 2 4 6M16 3c0 4-3 4.5-4 6-1 1.5-4 2-4 6" /></svg>;
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
