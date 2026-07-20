"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { batchUploadKnowledge, type BatchUploadItem } from "@/lib/actions";
import { KnowledgeCategoryEdit } from "@/components/KnowledgeCategoryEdit";

// 批量上传向导：选多个文件 → AI 自动分类并入库 → 弹窗逐个确认，不准的当场改分类
export function BatchUploadWizard({
  roleOptions,
  categories,
}: {
  roleOptions: { key: string; name: string }[];
  categories: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileCount, setFileCount] = useState(0);
  const [roles, setRoles] = useState<string[]>(roleOptions.map((r) => r.key));
  const [status, setStatus] = useState("active");
  const [mode, setMode] = useState<"auto" | "fixed">("auto");
  const [fixedCategory, setFixedCategory] = useState("");
  const [results, setResults] = useState<BatchUploadItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [opts, setOpts] = useState<string[]>(categories);
  const [error, setError] = useState("");

  function toggleRole(key: string) {
    setRoles((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function submit() {
    const files = fileRef.current?.files;
    setError("");
    if (!files || files.length === 0) return setError("请选择至少一个文件");
    if (roles.length === 0) return setError("请选择可见角色");
    if (mode === "fixed" && !fixedCategory.trim()) return setError("请选择或输入要归入的分类");
    const arr = Array.from(files);
    const oversize = arr.find((f) => f.size > 25 * 1024 * 1024);
    if (oversize) return setError(`「${oversize.name}」超过 25MB，请压缩或拆分后单独上传`);

    // 逐个文件上传：每个文件单独一个请求，绕开整批的请求体大小上限，并实时显示进度
    setResults([]);
    setTotal(arr.length);
    start(async () => {
      let acc = opts;
      for (const f of arr) {
        const fd = new FormData();
        fd.append("files", f);
        fd.append("filename", f.name); // 单独传一份正确的 UTF-8 文件名，避开 multipart 文件名编码问题
        roles.forEach((r) => fd.append("visible_roles", r));
        fd.append("status", status);
        if (mode === "fixed") fd.append("fixed_category", fixedCategory.trim());
        let item: BatchUploadItem;
        try {
          const r = await batchUploadKnowledge(fd);
          item =
            r.data?.results?.[0] ||
            { fileName: f.name, title: f.name, docId: null, category: "", isNew: false, chunks: 0, ok: false, message: r.message || "上传失败" };
          if (r.data?.categories?.length) acc = Array.from(new Set([...acc, ...r.data.categories]));
        } catch (e: any) {
          item = { fileName: f.name, title: f.name, docId: null, category: "", isNew: false, chunks: 0, ok: false, message: e?.message || "上传失败" };
        }
        setResults((prev) => [...(prev || []), item]);
        setOpts(acc);
      }
    });
  }

  function done() {
    if (pending) return; // 处理中不允许关闭，避免中断后续文件
    setResults(null);
    setTotal(0);
    setFileCount(0);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  const inputCls = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <div className="batch-upload-wizard space-y-3">
      <div>
        <label className="mb-1 block text-xs text-slate-500">
          选择文件 *（可多选，AI 会自动判分类，最大 25MB/个）
        </label>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".md,.txt,.docx,.pdf,.xlsx,.xls,.csv,.pptx,.jpg,.jpeg,.png,.webp"
          onChange={(e) => setFileCount(e.target.files?.length || 0)}
          className="w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:text-white"
        />
        {fileCount > 0 && <p className="mt-1 text-xs text-slate-400">已选 {fileCount} 个文件</p>}
      </div>

      <div>
        <label className="mb-1 block text-xs text-slate-500">分类方式 *</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("auto")}
            className={`rounded-lg border px-3 py-2 text-xs ${
              mode === "auto" ? "border-brand bg-brand/5 text-brand-dark" : "border-slate-200 text-slate-500"
            }`}
          >
            AI 自动分类
          </button>
          <button
            type="button"
            onClick={() => setMode("fixed")}
            className={`rounded-lg border px-3 py-2 text-xs ${
              mode === "fixed" ? "border-brand bg-brand/5 text-brand-dark" : "border-slate-200 text-slate-500"
            }`}
          >
            我指定分类
          </button>
        </div>
        {mode === "fixed" && (
          <>
            <input
              value={fixedCategory}
              onChange={(e) => setFixedCategory(e.target.value)}
              list="batch-categories"
              placeholder="选已有分类，或直接输入新分类（这批全归这里）"
              className={`mt-2 ${inputCls}`}
            />
            <datalist id="batch-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs text-slate-500">可见角色 *（这批文件统一设置）</label>
        <div className="grid grid-cols-3 gap-2">
          {roleOptions.map((r) => (
            <label key={r.key} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
              <input type="checkbox" checked={roles.includes(r.key)} onChange={() => toggleRole(r.key)} />
              {r.name}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-slate-500">是否启用</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
          <option value="active">启用（员工可检索）</option>
          <option value="disabled">暂存草稿（不可检索）</option>
        </select>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="w-full rounded-lg bg-brand py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending
          ? `正在处理 ${results?.length || 0}/${total}…`
          : mode === "auto"
            ? "批量上传并自动分类"
            : `批量上传到「${fixedCategory.trim() || "指定分类"}」`}
      </button>

      {/* 上传后确认弹窗 */}
      {results && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={done}>
          <div
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 text-base font-semibold text-slate-900">
              {pending ? "正在上传…" : mode === "auto" ? "AI 自动分类结果" : "上传结果"}
            </div>
            <p className="mb-3 text-xs text-slate-400">
              {pending ? (
                <>已处理 {results.length}/{total} 个，请稍候…</>
              ) : (
                <>
                  成功 {results.filter((r) => r.ok).length}/{results.length} 个。
                  {mode === "auto" ? "分类不准的，直接在右侧下拉改一下即可。" : "需要的话也可在右侧下拉单独改分类。"}
                </>
              )}
            </p>
            <div className="space-y-2">
              {results.map((r, i) => (
                <div key={i} className="rounded-xl border border-slate-200/70 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{r.title}</div>
                      <div className="mt-0.5 truncate text-[11px] text-slate-400">
                        {r.ok ? (
                          <>
                            {r.chunks} 片段 · {r.fileName}
                            {r.isNew && <span className="ml-1 text-brand-dark">· 新分类</span>}
                          </>
                        ) : (
                          <span className="text-red-500">失败：{r.message}</span>
                        )}
                      </div>
                    </div>
                    {r.ok && r.docId && (
                      <KnowledgeCategoryEdit docId={r.docId} category={r.category} options={opts} />
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={done}
              disabled={pending}
              className="mt-4 w-full rounded-lg bg-brand py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? `处理中 ${results.length}/${total}…` : "完成"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
