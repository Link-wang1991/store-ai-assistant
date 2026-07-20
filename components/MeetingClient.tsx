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
  const [consented, setConsented] = useState(true);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);

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

  useEffect(() => {
    if (!customerId && !isNewCustomer) {
      const first = myCustomers[0] || otherCustomers[0];
      if (first) {
        setCustomerId(first.id);
        setCustomerName(first.name);
      }
    }
  }, [myCustomers, otherCustomers, customerId, isNewCustomer]);

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

  async function startMeeting() {
    if (starting) return;
    setStarting(true);
    setError("");

    try {
      if (!consented) { setError("请先确认已向客户告知并获得同意"); setStarting(false); return; }
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

  const allCustomers = [...myCustomers, ...otherCustomers];
  const selected = allCustomers.find((c) => c.id === customerId);
  const sceneOptions = scenes.length ? scenes : [
    { code: "new_consult", display_name: "新客咨询", sort_order: 1 },
    { code: "service", display_name: "护理服务", sort_order: 2 },
    { code: "deal", display_name: "成交沟通", sort_order: 3 },
    { code: "repurchase", display_name: "复购回访", sort_order: 4 },
  ];

  return (
    <div className="px-4 pb-1 pt-5">
      {isRecording && (
        <div className="ref-card mb-4 flex items-center justify-between border-[#cfe9d7] bg-[#fbfffc] px-3 py-2.5">
          <div className="flex items-center gap-3"><span className="relative flex h-8 w-8 items-center justify-center"><span className="absolute h-7 w-7 animate-ping rounded-full bg-red-400/25"/><span className="h-2.5 w-2.5 rounded-full bg-red-500"/></span><div><b className="block text-[12px] text-[#263128]">{isStopping ? "正在上传录音" : isPaused ? "录音已暂停" : "录音中"}</b><span className="text-[11px] font-bold text-red-500">{timer}</span></div></div>
          {!isStopping && <div className="flex gap-2"><button onClick={() => { isPaused ? resumeRecording() : pauseRecording(); }} className="ref-secondary h-8 min-h-0 px-2.5">{isPaused ? "继续" : "暂停"}</button><button onClick={stopRecording} className="h-8 rounded-full bg-red-500 px-3 text-[11px] font-bold text-white">结束</button></div>}
        </div>
      )}
      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="ref-section-title">快速会谈设置</h2></div>
        <div className="ref-card ref-recording-card">
          <div><label className="ref-eyebrow block">客户类型</label><div className="ref-recording-kind mt-2"><button onClick={() => { setIsNewCustomer(true); setCustomerId(""); setCustomerName(""); setCustomerPickerOpen(false); setScene(sceneOptions[0].code); }} className={isNewCustomer ? "active" : ""}>新客户</button><button onClick={() => { setIsNewCustomer(false); setCustomerPickerOpen(false); setScene("repurchase"); }} className={!isNewCustomer ? "active" : ""}>已有客户</button></div></div>

          <div>
            <label className="ref-eyebrow block">选择客户</label>
            {isNewCustomer ? (
              <div className="mt-2">
                <div className="ref-customer-picker">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="ref-customer-avatar">{customerName?.slice(0, 1) || "新"}</span>
                    <div className="min-w-0">
                      <b className="block truncate text-[13px] text-[#263128]">{customerName || "新客户"}</b>
                      <span className="mt-1 block text-[11px] text-[#748077]">本次会谈结束后将创建客户档案</span>
                    </div>
                  </div>
                </div>
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="输入客户姓名（留空自动生成）" className="ref-field mt-2" />
              </div>
            ) : (
              <div className="mt-2">
                <button type="button" onClick={() => setCustomerPickerOpen((open) => !open)} className="ref-customer-picker" aria-expanded={customerPickerOpen}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="ref-customer-avatar">{selected?.name?.slice(0, 1) || "客"}</span>
                    <div className="min-w-0">
                      <b className="block truncate text-[13px] text-[#263128]">{selected?.name || "请选择已有客户"}</b>
                      <span className="mt-1 block text-[11px] text-[#748077]">{selected ? "已关联客户画像与历史" : "点击选择负责客户"}</span>
                    </div>
                  </div>
                  <PickerChevron open={customerPickerOpen} />
                </button>
                {customerPickerOpen && (
                  <div className="mt-2">
                    <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="搜索客户姓名" className="ref-field" />
                    <div className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                      {[...filteredMy, ...filteredOthers].map((c) => (
                        <button key={c.id} onClick={() => { setCustomerId(c.id); setCustomerName(c.name); setCustomerPickerOpen(false); }} className={`ref-chip ${customerId === c.id ? "active" : ""}`}>
                          {c.name}
                        </button>
                      ))}
                      {filteredMy.length + filteredOthers.length === 0 && <span className="ref-muted">没有找到客户</span>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div><label className="ref-eyebrow block">会谈场景</label><div className="ref-scene-wrap mt-2">{sceneOptions.map((s) => <button key={s.code} onClick={() => setScene(s.code)} className={`ref-chip ${scene === s.code ? "active" : ""}`}>{s.display_name}</button>)}</div></div>
          <label className="ref-consent"><input checked={consented} onChange={(e) => setConsented(e.target.checked)} type="checkbox" />已向客户告知并获得同意</label>
          {error && <p className="-mt-2 text-[12px] text-[#d84436]">{error}</p>}
          <button onClick={startMeeting} disabled={starting || isRecording} className="ref-primary min-h-[52px] w-full gap-2 text-[15px]"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17v4M8.5 21h7"/></svg>{starting ? "准备中…" : isRecording ? "会谈进行中" : "开始录音会谈"}</button>
        </div>
      </section>
    </div>
  );
}

function PickerChevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-[#77847b] transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}
