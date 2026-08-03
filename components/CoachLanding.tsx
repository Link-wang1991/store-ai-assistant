"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BottomNav, MAIN_NAV, STAFF_NAV, type NavItem } from "@/components/BottomNav";
import { customerApi } from "@/lib/api-client";
import { CoachModeTabs } from "@/components/CoachModeTabs";
import { fmtTime } from "@/lib/format";

interface CustLite {
  id: string;
  name: string;
  phone?: string | null;
  stage?: string | null;
  concerns?: string | null;
  lastVisitAt?: string | null;
  nextFollowAt?: string | null;
  assignedTo?: string | null;
}

const COACH_SELECTED_CUSTOMER_KEY = "store-ai:coach:selected-customer";

function advisorLabel(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  // 后端有时只返回员工 UUID；它不是客户侧应该看到的姓名。
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)) return fallback;
  return value;
}

export function CoachLanding({
  isAdmin,
  mode = "workbench",
}: {
  isAdmin: boolean;
  mode?: "workbench" | "classic";
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState<CustLite[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustLite | null>(null);
  const [notice, setNotice] = useState("");
  const nav: NavItem[] = isAdmin ? MAIN_NAV : STAFF_NAV;

  useEffect(() => {
    customerApi.list().then((r) => {
      if (r.ok && r.data) {
        const nextCustomers = r.data.map((c: any) => ({ id: c.id, name: c.name, phone: c.phone, stage: c.stage, concerns: c.concerns, lastVisitAt: c.last_visit_at || c.lastVisitAt, nextFollowAt: c.next_follow_at || c.nextFollowAt, assignedTo: c.assignedTo || c.assigned_to }));
        setCustomers(nextCustomers);
        const selectedId = window.localStorage.getItem(COACH_SELECTED_CUSTOMER_KEY);
        const restored = selectedId ? nextCustomers.find((item: CustLite) => item.id === selectedId) : null;
        if (restored) setSelectedCustomer(restored);
      }
    });
  }, []);

  const isCustomerMode = Boolean(selectedCustomer);
  const classic = mode === "classic";
  const chatHref = (question?: string) => {
    const params = new URLSearchParams({ new: "1" });
    if (classic) params.set("view", "classic");
    if (selectedCustomer?.id) params.set("customerId", selectedCustomer.id);
    if (question) params.set("q", question);
    return `/chat?${params.toString()}`;
  };
  const go = (prompt: string) => router.push(chatHref(prompt));
  const goCustomer = () => router.push(chatHref());
  const copyScript = async () => {
    const text = directScript;
    try { await navigator.clipboard.writeText(text); setNotice("话术已复制，可以直接发送给客户。"); }
    catch { setNotice("当前浏览器无法自动复制，请长按话术复制。"); }
    window.setTimeout(() => setNotice(""), 2400);
  };
  const filteredCustomers = customers.filter((c) =>
    !customerSearch ||
    c.name?.includes(customerSearch) ||
    c.phone?.includes(customerSearch)
  );

  const directScript = isCustomerMode
    ? `“${selectedCustomer?.name}，我想先把您最在意的${selectedCustomer?.concerns || "点"}了解清楚，再给您一个更适合的安排。”`
    : "“描述客户的顾虑、当前进展或你想达成的目标。我会给你可直接使用的话术和下一步动作。”";
  const nextQuestions = isCustomerMode
    ? [`“${selectedCustomer?.concerns || "这次需求"}”具体是指预算、效果、时间还是服务体验？`, "您希望这次沟通后先确认哪一步？"]
    : ["目前最想解决的具体问题是什么？", "希望这次对话推动到哪一步？"];
  const nextAction = isCustomerMode
    ? selectedCustomer?.nextFollowAt ? `按 ${fmtTime(selectedCustomer.nextFollowAt)} 的既定跟进安排确认客户意向` : "先确认客户当前顾虑，再决定是否创建跟进"
    : "先补充具体场景或选择一位客户，再生成可执行建议";
  const contextSummary = isCustomerMode
    ? "已带入客户档案、历史会谈复盘和已确认记忆；完整对话中会继续引用门店知识库。"
    : "当前未关联客户：教练只会使用门店知识库和你在对话中提供的事实。";

  return (
    <div className={`ref-app ${classic ? "ref-chat-standard" : "ref-chat-workbench"}`}>
      <div className="ref-canvas">
      <CoachModeTabs active={mode} />

      <main className="ref-chat-main space-y-4">
        <section className="ref-card ref-context">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2"><span className="rounded bg-[#e4f5e8] px-2 py-1 text-[11px] font-bold text-[#006d37]">{isCustomerMode ? "客户模式" : "通用模式"}</span><h1 className="truncate text-[18px] font-bold tracking-tight text-[#161d17]">{selectedCustomer?.name || "门店 AI 教练"}<span className="ml-1 text-[13px] font-normal text-[#506052]">{selectedCustomer?.phone ? `（尾号 ${selectedCustomer.phone.slice(-4)}）` : ""}</span></h1></div>
            <div className="flex gap-2"><button onClick={() => setPickerOpen((o) => !o)} className="ref-secondary h-9 min-h-0 px-3 text-[11px] text-[#006d37]">{isCustomerMode ? "切换客户" : "选择客户"}</button>{isCustomerMode && <button onClick={() => { setSelectedCustomer(null); window.localStorage.removeItem(COACH_SELECTED_CUSTOMER_KEY); setPickerOpen(false); }} className="ref-secondary h-9 min-h-0 px-3 text-[11px]">取消关联</button>}</div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-[12px] text-[#3d4a3e]">{isCustomerMode ? <><span className="flex items-center gap-1.5"><CalendarIcon />{selectedCustomer?.nextFollowAt ? `下次跟进：${fmtTime(selectedCustomer.nextFollowAt)}` : "暂无预约记录"}</span>{!classic && <span className="flex items-center gap-1.5"><HistoryIcon />{selectedCustomer?.lastVisitAt ? `最近服务：${fmtTime(selectedCustomer.lastVisitAt)}` : "暂无服务记录"}</span>}<span className="flex items-center gap-1.5"><PersonIcon />专属顾问：{advisorLabel(selectedCustomer?.assignedTo, isAdmin ? "当前负责人" : "当前顾问")}</span></> : <><span className="flex items-center gap-1.5"><ChatIcon />可随时直接提问</span><span className="flex items-center gap-1.5"><PersonIcon />{isAdmin ? "老板" : "当前员工"}</span></>}</div>
          {pickerOpen && (
            <div className="mt-3 border-t border-[#e8eee9] pt-3">
              <input
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="搜索客户姓名 / 手机号…"
                className="ref-field"
              />
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {filteredCustomers.length === 0 ? (
                  <div className="py-2 text-center text-[11px] text-[#8b968d]">暂无客户</div>
                ) : (
                  filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedCustomer(c); window.localStorage.setItem(COACH_SELECTED_CUSTOMER_KEY, c.id); setPickerOpen(false); }}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition hover:bg-[#effaf2]"
                    >
                      <span className="text-[13px] text-[#2b372e]">{c.name || "未命名客户"}</span>
                      <span className="text-[10px] text-[#819087]">{c.phone || c.stage || ""}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </section>

        <section className="ref-card ref-coach-script">
          <div className="flex items-center justify-between"><div className="ref-coach-label mb-0"><ChatIcon />可以直接说</div><button onClick={() => void copyScript()} className="flex items-center gap-1 text-[11px] font-bold text-[#006d37]"><CopyIcon />复制</button></div>
          <p className="mt-3 text-[16px] italic leading-relaxed text-[#1e2a20]">{directScript}</p>
        </section>

        <section className="ref-coach-grid">
          <div className="ref-card ref-coach-mini">
            <div className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-[#006d37]">
              <QuestionIcon />接下来要问
            </div>
            <p className="text-[13px] leading-relaxed text-[#3d4a3e]">1. {nextQuestions[0]}<br />2. {nextQuestions[1]}</p>
          </div>
          <div className="ref-card ref-coach-mini">
            <div className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-[#006d37]">
              <ActionIcon />下一步动作
            </div>
            <p className="text-[13px] leading-relaxed text-[#3d4a3e]">{nextAction}</p>
            <p className="mt-1 text-[11px] text-[#6c7b6d]">负责人：{advisorLabel(selectedCustomer?.assignedTo, isAdmin ? "当前负责人" : "当前员工")}</p>
          </div>
        </section>

        <section className={`ref-coach-risk ${selectedCustomer?.concerns ? "" : "ref-coach-reminder"}`}><WarningIcon /><div><b className="block text-[14px] text-[#c4392e]">{selectedCustomer?.concerns ? "风险提醒" : "沟通提醒"}</b><p className="mt-1 text-[13px] leading-relaxed text-[#b53a31]">{selectedCustomer?.concerns || "涉及价格、承诺、效果或投诉时，先确认事实与客户感受，再给出下一步方案。"}</p></div></section>

        <section className="ref-card ref-coach-script">
          <div className="ref-coach-label"><CoachMark />本次教练上下文</div>
          <p className="text-[13px] leading-relaxed text-[#3d4a3e]">{contextSummary}</p>
          <div className="mt-4 border-t border-[#e9ecef] pt-3 text-right"><button onClick={goCustomer} className="ref-primary min-h-[40px] px-4">▷ 开始完整对话</button></div>
        </section>

        <div className="h-10" />
      </main>
      <div className="ref-chat-input-wrap"><div className="ref-chat-input"><button onClick={() => router.push(chatHref())} title="在完整对话中上传图片"><PlusIcon /></button><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) go(q.trim()); }} placeholder="向教练提问..." className="min-w-0 flex-1 bg-transparent px-1 text-[13px] outline-none" /><button disabled className="opacity-45" title="录音暂未开放"><MicIcon /></button><button onClick={() => q.trim() && go(q.trim())} disabled={!q.trim()} className="send disabled:opacity-50"><SendIcon /></button></div></div>
      <BottomNav items={nav} />
      {notice && <div role="status" className="ref-toast">{notice}</div>}
      </div>
    </div>
  );
}

function DeepDetail({ icon, label, content }: { icon: React.ReactNode; label: string; content: string }) { return <details className="ref-deep-detail"><summary>{icon}<span>{label}</span><ChevronDownIcon /></summary><p>{content}</p></details>; }
function ChevronDownIcon() { return <svg viewBox="0 0 24 24" className="ml-auto h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>; }
function CalendarIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>; }
function HistoryIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" /><path d="M4 4v4.6h4.6M12 8v4l2.7 1.8" /></svg>; }
function PersonIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="8" r="3" /><path d="M5 21a7 7 0 0 1 14 0" /></svg>; }
function ChatIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 5h16v12H8l-4 3V5Z" /></svg>; }
function CopyIcon() { return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="4" width="11" height="13" rx="2" /><path d="M5 8H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" /></svg>; }
function QuestionIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M9.7 9a2.5 2.5 0 1 1 4.3 1.7c-.9.7-1.8 1.1-1.8 2.3M12 16h.01" /></svg>; }
function ActionIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m13 2-8 12h6l-1 8 9-13h-6l1-7Z" /></svg>; }
function WarningIcon() { return <svg viewBox="0 0 24 24" className="mt-0.5 h-6 w-6 shrink-0 text-[#c4392e]" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v4M12 16h.01" /></svg>; }
function CoachMark() { return <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M7 10a5 5 0 0 1 10 0v4a5 5 0 0 1-10 0v-4Z" /><path d="M9 10h.01M15 10h.01M9.5 15h5M12 5V3" /></svg>; }
function ChecklistIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m8 9 1.5 1.5L12 8M13.5 10h3M8 15l1.5 1.5L12 14M13.5 16h3" /></svg>; }
function DocumentIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>; }
function BulbIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M9 18h6M10 21h4M8 14a6 6 0 1 1 8 0c-1 1-1.5 1.7-1.5 3h-5c0-1.3-.5-2-1.5-3Z" /></svg>; }
function PlusIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 5v14M5 12h14" /></svg>; }
function MicIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4" /></svg>; }
function SendIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 12 14-7-4 14-3-5-7-2Z" /><path d="m12 14 3-3" /></svg>; }
