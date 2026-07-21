"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomNav, MAIN_NAV } from "@/components/BottomNav";
import { customerApi } from "@/lib/api-client";
import { Brand, AccountIcon } from "@/components/Brand";
import { STAGE_LABEL } from "@/lib/opportunity";
import { fmtTime } from "@/lib/format";

export function CustomerProfileApiFallback({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [quickQuestion, setQuickQuestion] = useState("");

  useEffect(() => {
    customerApi.list().then((result) => {
      if (result.ok) setCustomer((result.data || []).find((item: any) => item.id === customerId) || null);
      setReady(true);
    }).catch(() => setReady(true));
  }, [customerId]);

  if (!ready) return <div className="ref-app flex min-h-screen items-center justify-center text-[13px] text-[#6c7b6d]">正在加载客户档案…</div>;
  if (!customer) return <div className="ref-app flex min-h-screen items-center justify-center text-[13px] text-[#6c7b6d]">未找到这位客户</div>;

  const name = customer.name || "客户";
  const phoneTail = customer.phone ? `（尾号 ${String(customer.phone).slice(-4)}）` : "";
  const suggestion = customer.ai_suggestion || customer.aiSuggestion || "关注服务体验与当前需求，先确认客户感受，再给出合适的下一步服务建议。";
  const concerns = customer.concerns || "";
  const tags = Array.isArray(customer.tags) && customer.tags.length ? customer.tags : ["注重体验", "服务跟进", "品质偏好"];
  const stage = customer.stageLabel || STAGE_LABEL[customer.stage] || "VIP 会员";
  const lastVisit = customer.last_visit_at || customer.lastVisitAt;
  const openQuickQuestion = () => {
    const question = quickQuestion.trim() || `${name}现在最需要跟进什么？请给我话术和下一步动作。`;
    router.push(`/chat?customerId=${customer.id}&new=1&q=${encodeURIComponent(question)}`);
  };

  return <div className="ref-app"><div className="ref-canvas">
    <header className="ref-topbar"><div className="flex min-w-0 items-center gap-1"><Link href="/customers" className="ref-icon-button" aria-label="返回客户列表">←</Link><Brand /></div><Link href="/me" className="ref-customer-account" aria-label="进入我的"><AccountIcon /></Link></header>
    <main className="ref-profile ref-customer-profile">
      <section className="ref-customer-hero"><div className="ref-profile-avatar">{name.slice(0, 1)}</div><div className="mt-5"><div className="flex flex-wrap items-baseline gap-2"><h1 className="ref-profile-name">{name}</h1><span className="text-[13px] text-[#3d4a3e]">{phoneTail}</span></div><span className="ref-customer-tier">{stage}</span><p className="mt-2 text-[15px] text-[#3d4a3e]">{lastVisit ? `上次服务：${fmtTime(lastVisit)}` : "上次服务：暂未记录"}</p></div><div className="ref-profile-actions"><Link href={`/chat?customerId=${customer.id}&new=1`} className="ref-primary gap-2 px-5"><ChatIcon />开始咨询</Link><a href={customer.phone ? `tel:${customer.phone}` : undefined} className="ref-secondary gap-2 px-5"><PhoneIcon />致电</a></div></section>
      <section className="ref-card ref-brief"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><SparkIcon /><h2 className="mb-0 text-[16px] font-bold tracking-tight text-[#172119]">今日简报</h2></div><span className="rounded bg-[#f1f6f2] px-2 py-1 text-[10px] font-bold text-[#6d796f]">AI 洞察</span></div><div className="ref-brief-grid"><div><h3 className="ref-eyebrow">核心需求 &amp; 待办承诺</h3><p className="mt-3 flex gap-2 text-[14px] leading-relaxed text-[#253527]"><CheckIcon /><span>{suggestion}</span></p>{concerns ? <p className="mt-3 flex gap-2 text-[14px] leading-relaxed text-[#c4392e]"><WarningIcon /><span>{concerns}</span></p> : <p className="mt-3 flex gap-2 text-[13px] leading-relaxed text-[#5b7460]"><CheckIcon /><span>当前没有已记录的风险提示，沟通时继续确认服务感受即可。</span></p>}<div className="mt-5"><div className="mb-2 text-[13px] font-bold text-[#3d4a3e]">关键提问（3个）</div><ol className="space-y-1 text-[13px] leading-relaxed text-[#3d4a3e]"><li>1. 上次服务后的感受如何？</li><li>2. 目前最在意的效果是什么？</li><li>3. 下一次方便安排在什么时候？</li></ol></div></div><div className="ref-opening-script"><h3 className="text-[13px] font-bold text-[#006d37]">开场白建议</h3><p className="mt-2 text-[14px] italic leading-relaxed text-[#253527]">“{name}，您好！想跟您确认一下上次服务后的感受。我们已准备了更适合您的下一步方案。”</p></div></div></section>
      <section className="ref-card ref-customer-action"><span className="ref-customer-action-icon"><PlayIcon /></span><div className="min-w-0 flex-1"><h2 className="text-[16px] font-bold text-[#161d17]">当前行动：深度服务跟进</h2><p className="mt-1 text-[12px] text-[#6c7b6d]">正在准备：结合客户画像生成服务建议</p></div><Link href={`/chat?customerId=${customer.id}&new=1`} className="ref-primary min-h-[44px] px-4">开始记录</Link></section>
      <section className="ref-card ref-customer-persona"><h2 className="mb-3 text-[16px] font-bold tracking-tight text-[#172119]">客户画像</h2><div className="mb-3 flex items-center justify-between text-[13px] font-semibold"><span>会员粘性</span><strong className="text-[#006d37]">高（85%）</strong></div><div className="ref-persona-meter"><i /></div><div className="mt-4 flex flex-wrap gap-2">{tags.slice(0, 4).map((tag: string) => <span key={tag} className="ref-persona-tag">{tag}</span>)}</div><p className="mt-4 text-[13px] leading-relaxed text-[#3d4a3e]">{customer.personality || `${name} 注重服务细节与专业度，喜欢舒适放松的体验。`}</p></section>
      <section className="ref-card p-4"><div className="mb-3 flex items-center justify-between"><h2 className="text-[16px] font-bold tracking-tight text-[#172119]">AI 记忆</h2><Link href={`/chat?customerId=${customer.id}&new=1`} aria-label="补充客户记忆" className="text-[22px] text-[#006d37]">＋</Link></div><div className="border-l-[3px] border-l-[#2ecc71] pl-3"><b className="text-[13px] text-[#006d37]">暂无已确认记忆</b><p className="mt-1 text-[13px] text-[#3d4a3e]">会谈、跟进与 AI 对话中的确认信息会自动沉淀在这里。</p></div></section>
      <section className="ref-card p-4"><div className="mb-3 flex items-center justify-between"><h2 className="text-[16px] font-bold tracking-tight text-[#172119]">会谈记录</h2><Link href="/meeting" className="text-[12px] font-bold text-[#006d37]">查看全部</Link></div><Link href="/meeting" className="flex items-center gap-3 rounded-xl bg-[#eef6eb] p-3 text-[#3d4a3e]"><MicIcon /><span><b className="block text-[13px] text-[#161d17]">发起一次会谈记录</b><small className="mt-1 block text-[11px]">录音、转写与 AI 复盘会自动关联到该客户</small></span><span className="ml-auto">›</span></Link></section>
      <section className="ref-card ref-timeline"><h2 className="mb-3 text-[16px] font-bold tracking-tight text-[#172119]">互动时间线</h2><div className="ref-timeline-row"><div><b className="text-[13px] text-[#161d17]">等待新的互动记录</b><p className="mt-1 text-[12px] text-[#6c7b6d]">后续服务、会谈与跟进动作会沉淀在这里。</p></div></div></section>
    </main>
    <div className="ref-customer-quick-ask">
      <div className="ref-customer-quick-avatar" aria-hidden="true">{name.slice(0, 1)}</div>
      <input value={quickQuestion} onChange={(event) => setQuickQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") openQuickQuestion(); }} placeholder={`向 AI 询问关于 ${name} 的问题`} aria-label={`向 AI 询问 ${name}`} />
      <button type="button" onClick={openQuickQuestion} aria-label="发送给 AI 教练"><SendIcon /></button>
    </div>
    <BottomNav items={MAIN_NAV} />
  </div></div>;
}

function ChatIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 5h16v12H8l-4 3V5Z" /></svg>; }
function PhoneIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 3h3l2 5-2 1.5a14 14 0 0 0 4.5 4.5L16 12l5 2v3c0 1.1-.9 2-2 2C10.2 19 5 13.8 5 5c0-1.1.9-2 2-2Z" /></svg>; }
function SparkIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#006d37]" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z" /></svg>; }
function CheckIcon() { return <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-[#006d37]" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.3 2.3 4.8-5" /></svg>; }
function WarningIcon() { return <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-[#c4392e]" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v4M12 16h.01" /></svg>; }
function PlayIcon() { return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><path d="m10 8 5 4-5 4V8Z" /></svg>; }
function MicIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4" /></svg>; }
function SendIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="m21 3-8.5 18-2.6-7.9L2 10.5 21 3Z" /><path d="m9.9 13.1 4.3-4.2" /></svg>; }
