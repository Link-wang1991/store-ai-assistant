"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  dataLifecycleApi,
  type StoreDataBackup,
  type StoreDataClearResult,
  type StoreDataPreview,
} from "@/lib/api-client";

function total(counts: Record<string, number>) {
  return Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
}

export function StoreDataLifecyclePanel() {
  const router = useRouter();
  const [preview, setPreview] = useState<StoreDataPreview | null>(null);
  const [backup, setBackup] = useState<StoreDataBackup | null>(null);
  const [clearResult, setClearResult] = useState<StoreDataClearResult | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"backup" | "clear" | null>(null);
  const [error, setError] = useState("");

  const refreshPreview = async () => {
    setLoading(true);
    setError("");
    const result = await dataLifecycleApi.preview();
    if (result.ok && result.data) setPreview(result.data);
    else setError(result.error || "无法读取当前经营数据，请确认仍以老板身份登录。");
    setLoading(false);
  };

  useEffect(() => {
    void refreshPreview();
  }, []);

  const canClear = !!preview && confirmation.trim() === preview.confirmationPhrase && !working;
  const rowsToClear = useMemo(() => total(preview?.counts || {}), [preview]);

  const createBackup = async () => {
    setWorking("backup");
    setError("");
    const result = await dataLifecycleApi.backup();
    if (result.ok && result.data) setBackup(result.data);
    else setError(result.error || "备份失败，未执行任何清理。");
    setWorking(null);
  };

  const clearData = async () => {
    if (!preview || !canClear) return;
    setWorking("clear");
    setError("");
    const result = await dataLifecycleApi.clear(confirmation.trim());
    if (result.ok && result.data) {
      setClearResult(result.data);
      setBackup(result.data.backup);
      setConfirmation("");
      setPreview({ ...preview, counts: {}, totalRows: 0 });
      router.refresh();
    } else {
      setError(result.error || "清理失败。系统没有确认完成前，请不要导入真实数据。");
    }
    setWorking(null);
  };

  if (loading) {
    return <div className="rounded-2xl border border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">正在核对本店经营数据…</div>;
  }

  if (!preview) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
        <p className="text-sm font-semibold text-red-700">无法进入数据切换</p>
        <p className="mt-1 text-xs leading-5 text-red-600">{error || "请重新登录后再试。"}</p>
        <button onClick={() => void refreshPreview()} className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700">重新检查</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[var(--line)] bg-white p-4 shadow-[0_8px_24px_rgba(46,78,56,0.05)]">
        <span className="inline-flex rounded-full bg-[var(--green-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--green-dark)]">上线前数据切换</span>
        <h2 className="mt-3 text-lg font-semibold tracking-tight text-[#172119]">先备份，再导入真实门店数据</h2>
        <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">
          当前库里有 {rowsToClear} 条可清理的经营数据。清理只针对本门店的客户、会谈、任务、AI 对话及经营记录；不会删除账号、员工、角色、配置、知识库或原始文件。
        </p>
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#243128]">1. 当前数据预览</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">仅显示会被清理的经营数据，不会自动删除。</p>
          </div>
          <button onClick={() => void refreshPreview()} className="shrink-0 text-xs font-medium text-[var(--green-dark)]">刷新</button>
        </div>
        {Object.keys(preview.counts).length ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {Object.entries(preview.counts).map(([label, count]) => (
              <div key={label} className="rounded-xl border border-[#e6eee8] bg-[#fbfdfb] px-3 py-2.5">
                <div className="text-lg font-semibold text-[#172119]">{count}</div>
                <div className="mt-0.5 text-[11px] text-[var(--muted)]">{label}</div>
              </div>
            ))}
          </div>
        ) : <p className="mt-3 rounded-xl bg-[#f5faf6] px-3 py-3 text-xs text-[var(--green-dark)]">当前没有可清理的经营数据。</p>}
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
        <h3 className="text-sm font-semibold text-[#243128]">2. 先生成本地备份</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">备份为 JSON，保存到 {preview.backupLocation}。执行清理时系统还会自动再生成一份最新备份。</p>
        <button
          onClick={() => void createBackup()}
          disabled={working !== null}
          className="mt-3 rounded-xl border border-[var(--green)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--green-dark)] disabled:opacity-50"
        >
          {working === "backup" ? "正在生成备份…" : "生成备份"}
        </button>
        {backup && <p className="mt-2 rounded-lg bg-[#f5faf6] px-3 py-2 text-xs text-[var(--green-dark)]">已备份 {backup.totalRows} 条记录：{backup.fileName}</p>}
      </section>

      <section className="rounded-2xl border border-red-200 bg-[#fffafa] p-4">
        <h3 className="text-sm font-semibold text-[#9f2721]">3. 清空演示/测试经营数据</h3>
        <p className="mt-1 text-xs leading-5 text-[#8f5b57]">
          此操作不可直接撤销，但会在删除前自动备份。请确认你已经核对上方预览，并完整输入确认文字。
        </p>
        <input
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder={`输入：${preview.confirmationPhrase}`}
          className="mt-3 w-full rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-400"
        />
        <button
          onClick={() => void clearData()}
          disabled={!canClear}
          className="mt-3 w-full rounded-xl bg-[#c43b31] py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35"
        >
          {working === "clear" ? "正在备份并清理…" : "备份后清空本店经营数据"}
        </button>
        {clearResult && <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-[var(--green-dark)]">已清理 {clearResult.totalRows} 条经营记录，并自动备份为 {clearResult.backup.fileName}。</p>}
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
        <h3 className="text-sm font-semibold text-[#243128]">4. 导入真实门店资料</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">客户表先经过字段映射、去重和负责人核对；知识库上传后可设置分类与可见角色。</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link href="/customers/import" className="rounded-xl bg-[var(--green)] px-3 py-2.5 text-center text-sm font-semibold text-white">导入客户</Link>
          <Link href="/admin/knowledge/upload" className="rounded-xl border border-[var(--green)] bg-white px-3 py-2.5 text-center text-sm font-semibold text-[var(--green-dark)]">上传知识库</Link>
        </div>
      </section>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">{error}</p>}
    </div>
  );
}
