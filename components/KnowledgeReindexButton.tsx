"use client";

import { useState } from "react";
import { knowledgeApi } from "@/lib/api-client";

/** 老资料升级后可手动补向量，不必重新上传，也不会影响关键词检索。 */
export function KnowledgeReindexButton() {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  async function reindex() {
    setWorking(true);
    setMessage("");
    const result = await knowledgeApi.reindexEmbeddings();
    if (result.ok && result.data) {
      setMessage(`已处理 ${result.data.total} 个片段，成功补建 ${result.data.indexed} 个语义向量。`);
    } else {
      setMessage(result.error || "暂时无法补建语义向量，当前仍会使用关键词检索。");
    }
    setWorking(false);
  }

  return (
    <div className="rounded-xl border border-[#dcebe0] bg-[#f8fcf8] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-xs font-semibold text-[#263128]">旧资料语义检索升级</p><p className="mt-0.5 text-[11px] leading-4 text-[#6c7b6d]">为已上传资料补建向量；不会删除内容，也不会影响使用中的关键词检索。</p></div>
        <button onClick={() => void reindex()} disabled={working} className="rounded-lg border border-[#078a4c] bg-white px-3 py-2 text-xs font-semibold text-[#006d37] disabled:opacity-50">{working ? "正在补建…" : "补建语义向量"}</button>
      </div>
      {message && <p role="status" className="mt-2 text-[11px] text-[#48634f]">{message}</p>}
    </div>
  );
}
