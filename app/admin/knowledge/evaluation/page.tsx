"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { KnowledgeTabs } from "@/components/KnowledgeTabs";
import { AppLoading } from "@/components/AppLoading";
import { decodeJwtPayload } from "@/lib/jwt";
import { getToken, knowledgeApi } from "@/lib/api-client";
import { useRouter } from "next/navigation";

export default function KnowledgeEvaluationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [expected, setExpected] = useState("");
  const [docs, setDocs] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);
  const [notice, setNotice] = useState("");
  const [running, setRunning] = useState(false);
  const load = useCallback(async () => {
    const payload = decodeJwtPayload(getToken() || "");
    if (!payload) { router.replace("/login"); return; }
    if (!["owner", "manager", "admin"].includes(String(payload.role || ""))) { router.replace("/home"); return; }
    const [evaluation, documents] = await Promise.all([knowledgeApi.listRetrievalEvaluations(), knowledgeApi.list()]);
    if (evaluation.ok) setResult(evaluation.data); else setNotice(evaluation.error || "检索质检记录读取失败");
    if (documents.ok) setDocs(documents.data || []);
    setLoading(false);
  }, [router]);
  useEffect(() => { void load(); }, [load]);
  async function run(event: FormEvent) {
    event.preventDefault(); setRunning(true); setNotice("");
    const response = await knowledgeApi.runRetrievalEvaluation(question, expected || undefined);
    setRunning(false);
    if (!response.ok) { setNotice(response.error || "检索质检运行失败"); return; }
    setNotice(response.data?.evaluation_status === "pass" ? "本次期望资料已出现在召回结果中。" : response.data?.evaluation_status === "fail" ? "本次期望资料未被召回，请检查资料内容、分类或关键词。" : "已保存未标注测试；选择期望资料后才会计入命中率。");
    setQuestion(""); setExpected(""); await load();
  }
  async function verdict(id: string, status: "pass" | "fail") { const response = await knowledgeApi.reviewRetrievalEvaluation(id, status); if (!response.ok) setNotice(response.error || "保存结论失败"); else await load(); }
  if (loading) return <AppLoading label="正在读取检索质检…" />;
  const summary = result?.summary || {};
  const docsById = new Map(docs.map((document) => [document.id, document.title]));
  return <div className="min-h-screen bg-[var(--page)]"><header className="ref-topbar"><Link href="/admin/knowledge" className="ref-icon-button" aria-label="返回知识库">←</Link><div><h1 className="text-[17px] font-bold text-[#161d17]">检索质检</h1><p className="text-[10px] text-[#738077]">用真实业务问题验证资料是否被召回</p></div></header><KnowledgeTabs /><main className="space-y-3 p-4 pb-8">{notice && <p role="status" className="rounded-xl border border-[#d8e6da] bg-white p-3 text-[12px] text-[#3d4a3e]">{notice}</p>}<section className="rounded-2xl border border-[#d8e6da] bg-white p-4"><h2 className="text-[15px] font-bold text-[#172119]">新增真实测试题</h2><p className="mt-1 text-[11px] leading-relaxed text-[#738077]">选择“期望资料”后，系统把它是否出现在本次前五条召回中记为通过/失败。没有期望资料的测试不计入命中率。</p><form onSubmit={run} className="mt-3 space-y-2"><textarea required minLength={2} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：敏感肌客户担心术后泛红，店内应如何解释护理边界？" className="min-h-20 w-full rounded-xl border border-[#cfe0d1] p-3 text-[12px] outline-none focus:border-[#007e43]" /><select value={expected} onChange={(event) => setExpected(event.target.value)} className="w-full rounded-xl border border-[#cfe0d1] bg-white p-3 text-[12px]"><option value="">不指定期望资料（只保存供人工复查）</option>{docs.map((document) => <option key={document.id} value={document.id}>{document.title} · {document.category || "未分类"}</option>)}</select><button disabled={running} className="ref-primary w-full">{running ? "正在检索并保存…" : "运行真实检索质检"}</button></form></section><section className="grid grid-cols-2 gap-2">{[["已标注", summary.labelled ?? 0], ["召回命中率", summary.hit_rate == null ? "—" : `${summary.hit_rate}%`], ["失败", summary.failed ?? 0], ["零召回率", summary.zero_hit_rate == null ? "—" : `${summary.zero_hit_rate}%`]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-[#d8e6da] bg-white p-3"><p className="text-[11px] text-[#738077]">{label}</p><b className="mt-1 block text-xl text-[#172119]">{value}</b></div>)}</section><p className="px-1 text-[10px] leading-relaxed text-[#738077]">{summary.method}</p><section className="space-y-2">{(result?.items || []).length === 0 ? <div className="ref-empty">还没有质检题。建议先录入门店最常见的 10 个真实咨询问题。</div> : result.items.map((item: any) => <article key={item.id} className="rounded-2xl border border-[#d8e6da] bg-white p-3"><p className="text-[12px] font-semibold text-[#172119]">{item.question}</p><p className="mt-1 text-[11px] text-[#526152]">期望：{item.expected_document_title || "未指定"}</p><p className="mt-1 text-[11px] text-[#738077]">实际召回：{(item.returned_document_ids || []).map((id: string) => docsById.get(id) || id).join("、") || "无"}</p><div className="mt-2 flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] ${item.evaluation_status === "pass" ? "bg-emerald-50 text-emerald-700" : item.evaluation_status === "fail" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{item.evaluation_status === "pass" ? "通过" : item.evaluation_status === "fail" ? "失败" : "待人工判定"}</span>{item.evaluation_status === "unrated" && <><button onClick={() => void verdict(item.id, "pass")} className="text-[10px] text-[#007e43] underline">标记有效</button><button onClick={() => void verdict(item.id, "fail")} className="text-[10px] text-red-600 underline">标记无效</button></>}</div></article>)}</section></main></div>;
}
