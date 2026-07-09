"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, customerApi, meetingApi } from "@/lib/api-client";
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
  const [recording, setRecording] = useState(false);

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
        setOtherCustomers(all.filter((c: any) => c.assignedTo && c.assignedTo !== eid).map((c: any) => ({ id: c.id, name: c.name })));
      }
      if (mr.status === "fulfilled" && mr.value.ok) {
        setMyMeetings((mr.value.data || []).filter(
          (m: any) => !(m.status === "recording" && now - new Date(m.created_at).getTime() > 10 * 60 * 1000)
        ));
      }
      setLoading(false);
    });
  }, [router]);

  const handleDelete = async (id: string) => {
    const res = await meetingApi.delete(id);
    if (res.ok) {
      setMyMeetings((prev) => prev.filter((m) => m.id !== id));
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center text-sm text-slate-400">加载中…</div>;

  const isAdmin = isAdminRole(role);
  const nav = isAdmin ? MAIN_NAV : STAFF_NAV;

  return (
    <div className="min-h-screen bg-[var(--page)] pb-20">
      {/* 顶部品牌栏 */}
      <div className="bg-[var(--green)] px-4 pb-4 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-white font-bold text-[13px]">H</div>
            <div>
              <div className="text-[15px] font-semibold text-white">门店 AI Inbox</div>
              <div className="text-[11px] text-white/70">咨询成交提效 / 护理/销售/回访</div>
            </div>
          </div>
        </div>
      </div>

      {/* 录音区 */}
      <MeetingClient myCustomers={myCustomers} otherCustomers={otherCustomers} onRecordingChange={setRecording} />

      {/* 会谈记录列表（录音中隐藏） */}
      {!recording && (
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
              <SwipeableItem key={m.id} onDelete={() => handleDelete(m.id)}>
                <Link
                  href={`/meeting/${m.id}`}
                  className="block rounded-2xl border border-[var(--line)] bg-white p-3.5 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[var(--green)]" />
                      <span className="text-[14px] font-medium text-[var(--ink)]">
                        {m.customerName || m.customer_name || m.customer_records?.name || "临时客户"}
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
      )}

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
  const doDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    await onDelete();
  };

  return (
    <div className="relative overflow-hidden" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
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
