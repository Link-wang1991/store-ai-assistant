"use client";

import { useEffect, useMemo, useState } from "react";
import { getToken } from "@/lib/api-client";
import { API_BASE_URL } from "@/lib/data-source";
import { useRecording } from "@/components/RecordingContext";

interface Cust { id: string; name: string }

interface SceneOption { code: string; display_name: string; sort_order: number }

export function MeetingClient({ myCustomers, otherCustomers, onRefresh }: {
  myCustomers: Cust[];
  otherCustomers: Cust[];
  onRefresh?: () => void;
}) {
  const {
    isRecording, isPaused, isStopping, timer,
    startRecording, pauseRecording, resumeRecording, stopRecording,
  } = useRecording();

  // setup 表单
  const [isNewCustomer, setIsNewCustomer] = useState(true);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [scene, setScene] = useState("new_consult");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [scenes, setScenes] = useState<SceneOption[]>([]);

  useEffect(() => {
    const t = getToken();
    fetch(`${API_BASE_URL}/api/meetings/scenes`, {
      headers: { Authorization: `Bearer ${t}` },
    }).then(r => r.json()).then(j => {
      if (j.code === 200 && j.data?.length) {
        setScenes(j.data);
        setScene(j.data[0].code);
      }
    }).catch(() => {});
  }, []);

  const filteredMy = useMemo(() => {
    if (!searchTerm) return myCustomers;
    const q = searchTerm.toLowerCase();
    return myCustomers.filter((c) => c.name.toLowerCase().includes(q));
  }, [myCustomers, searchTerm]);

  const filteredOthers = useMemo(() => {
    if (!searchTerm) return otherCustomers;
    const q = searchTerm.toLowerCase();
    return otherCustomers.filter((c) => c.name.toLowerCase().includes(q));
  }, [otherCustomers, searchTerm]);

  // 正在录音中 → 显示紧凑录音指示条，不遮挡会谈列表
  if (isRecording) {
    return (
      <div className="px-4 pb-2 pt-3">
        <div className="flex items-center justify-between rounded-xl border border-[var(--green)] bg-[var(--green-soft)] px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--green)]" />
            <span className="text-[13px] font-mono font-bold text-[var(--ink)]">{timer}</span>
            <span className="text-[11px] text-[var(--faint)]">{isStopping ? "上传中…" : isPaused ? "已暂停" : "录音中"}</span>
          </div>
          {!isStopping && (
            <div className="flex items-center gap-2">
              <button onClick={() => { isPaused ? resumeRecording() : pauseRecording(); }} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[var(--yellow)] shadow-sm active:scale-90 transition">
                {isPaused ? (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                )}
              </button>
              <button onClick={() => { if (!isStopping) stopRecording(); }} className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white shadow-sm active:scale-90 transition">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  async function startMeeting() {
    if (starting) return;
    setStarting(true);
    setError("");

    try {
      if (!isNewCustomer && !customerId) { setError("请选择客户"); setStarting(false); return; }

      const result = await startRecording({
        isNewCustomer,
        customerId,
        customerName,
        scene,
      });

      if (!result.ok) {
        setError(result.error || "录音启动失败");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  }

  // ── setup 表单 ──
  return (
    <div className="px-4 pb-2 pt-3">
      <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
        <h3 className="text-[14px] font-semibold text-[var(--ink)]">快速录音</h3>
        <p className="mt-0.5 text-[11px] text-[var(--faint)]">选好场景，点「开始」即可录制</p>

        {/* 新老切换 */}
        <div className="mt-3 flex gap-1 rounded-lg bg-[var(--page)] p-0.5">
          <button onClick={() => { setIsNewCustomer(true); setCustomerId(""); if (scenes.length) setScene(scenes[0].code); }} className={`flex-1 rounded-md py-1.5 text-[12px] font-medium transition ${isNewCustomer ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"}`}>新客户</button>
          <button onClick={() => { setIsNewCustomer(false); setScene("repurchase"); }} className={`flex-1 rounded-md py-1.5 text-[12px] font-medium transition ${!isNewCustomer ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"}`}>老客户</button>
        </div>

        <div className="mt-3 space-y-3">
          {isNewCustomer ? (
            <div>
              <label className="text-[12px] font-medium text-[var(--muted)]">客户姓名</label>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="输入客户姓名（留空自动生成）" className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--page)] px-3 py-2.5 text-[13px] outline-none focus:border-[var(--green)]" />
            </div>
          ) : (
            <div>
              <label className="text-[12px] font-medium text-[var(--muted)]">选择客户</label>
              <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="搜索客户名" className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--page)] px-3 py-2.5 text-[13px] outline-none focus:border-[var(--green)]" />
              {filteredMy.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-[10px] text-[var(--faint)]">我负责的</p>
                  <div className="flex flex-wrap gap-1.5">
                    {filteredMy.map((c) => (
                      <button key={c.id} onClick={() => { setCustomerId(c.id); setCustomerName(c.name); }} className={`rounded-full border px-2.5 py-1 text-[11px] transition ${customerId === c.id ? "border-[var(--green)] bg-[var(--green-soft)] text-[var(--green-dark)] font-medium" : "border-[var(--line)] bg-white text-[var(--muted)]"}`}>{c.name}</button>
                    ))}
                  </div>
                </div>
              )}
              {filteredOthers.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-[10px] text-[var(--faint)]">其他员工</p>
                  <div className="flex flex-wrap gap-1.5">
                    {filteredOthers.map((c) => (
                      <button key={c.id} onClick={() => { setCustomerId(c.id); setCustomerName(c.name); }} className={`rounded-full border px-2.5 py-1 text-[11px] transition ${customerId === c.id ? "border-[var(--green)] bg-[var(--green-soft)] text-[var(--green-dark)] font-medium" : "border-[var(--line)] bg-white text-[var(--muted)]"}`}>{c.name}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-[12px] font-medium text-[var(--muted)]">咨询场景</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {scenes.map((s) => (
                <button key={s.code} onClick={() => setScene(s.code)} className={`rounded-full border px-2.5 py-1 text-[11px] transition ${scene === s.code ? "border-[var(--green)] bg-[var(--green-soft)] text-[var(--green-dark)] font-medium" : "border-[var(--line)] bg-white text-[var(--muted)]"}`}>{s.display_name}</button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}

        <div className="mt-4 flex justify-center">
          <button onClick={startMeeting} disabled={starting} className="rounded-full bg-[var(--green)] px-7 py-2.5 text-[14px] font-medium text-white shadow-sm disabled:opacity-50">
            {starting ? "准备中…" : "开始录音"}
          </button>
        </div>
      </div>
    </div>
  );
}
