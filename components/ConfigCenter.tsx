"use client";

import { useEffect, useRef, useState } from "react";
import { CONFIG_CATEGORIES, CONFIG_HASH_ALIAS, type ConfigItem } from "@/lib/config-defaults";
import { saveConfigCategory } from "@/lib/actions";

export function ConfigCenter({ initial }: { initial: Record<string, ConfigItem[]> }) {
  const [active, setActive] = useState(CONFIG_CATEGORIES[0].key);
  const [data, setData] = useState<Record<string, ConfigItem[]>>(initial);
  const dataRef = useRef<Record<string, ConfigItem[]>>(initial);
  const inputRefs = useRef<Record<string, Array<HTMLInputElement | null>>>({});
  const [savingCount, setSavingCount] = useState(0);
  const [savedTip, setSavedTip] = useState("");
  const isSaving = savingCount > 0;
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    if (!h) return;
    const key = CONFIG_HASH_ALIAS[h] || h;
    if (CONFIG_CATEGORIES.some((c) => c.key === key)) setActive(key);
  }, []);

  const items = data[active] || [];

  // 立即保存指定类别（每个离散操作 / 改名失焦都即时落库，不依赖去抖，避免切类或离开页面丢失）
  const persist = (category: string, next: ConfigItem[]) => {
    setSavingCount((n) => n + 1);
    setSavedTip("");
    void saveConfigCategory(category, next)
      .then((r) => {
        if (!r.ok) window.alert(r.message || "保存失败");
        else {
          setSavedTip("已保存");
          setTimeout(() => setSavedTip(""), 1500);
        }
      })
      .catch((error) => {
        window.alert(error instanceof Error ? error.message : "保存失败");
      })
      .finally(() => {
        setSavingCount((n) => Math.max(0, n - 1));
      });
  };

  // 更新本地（同步写入 ref，避免 onBlur / 连续操作拿到 stale 值）；save=true 立即落库
  const commit = (next: ConfigItem[], save = true) => {
    const merged = { ...dataRef.current, [active]: next };
    dataRef.current = merged;
    setData(merged);
    if (save) persist(active, next);
  };

  const cur = () => dataRef.current[active] || [];
  const readDomItems = (category: string) => {
    const base = dataRef.current[category] || [];
    const refs = inputRefs.current[category] || [];
    return base.map((it, idx) => {
      const value = refs[idx]?.value;
      return value === undefined ? it : { ...it, name: value.trim() || it.name };
    });
  };
  const saveActiveFromDom = () => {
    const next = readDomItems(active);
    const merged = { ...dataRef.current, [active]: next };
    dataRef.current = merged;
    setData(merged);
    persist(active, next);
  };
  const rename = (i: number, name: string) => commit(cur().map((it, idx) => (idx === i ? { ...it, name } : it)), false);
  const renameBlur = (i: number, name: string) => {
    const next = cur().map((it, idx) => (idx === i ? { ...it, name: name.trim() || it.name } : it));
    commit(next);
  };
  const toggle = (i: number, k: "enabled" | "visibleToStaff") =>
    commit(cur().map((it, idx) => (idx === i ? { ...it, [k]: !it[k] } : it)));
  const move = (i: number, dir: -1 | 1) => {
    const arr = cur();
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const remove = (i: number) => commit(cur().filter((_, idx) => idx !== i));
  const saveNew = () => {
    const name = newName.trim();
    if (!name) return;
    const code = `custom_${Date.now().toString(36)}`;
    commit([...cur(), { code, name, enabled: true, visibleToStaff: true }]);
    setNewName("");
    setAdding(false);
  };
  const cancelAdd = () => {
    setNewName("");
    setAdding(false);
  };

  return (
    <div className="space-y-3">
      {/* 类别切换 */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {CONFIG_CATEGORIES.map((c) => (
          <button
            key={c.key}
            onMouseDown={() => {
              if (c.key !== active) saveActiveFromDom();
            }}
            onClick={() => { setActive(c.key); cancelAdd(); }}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition ${
              c.key === active ? "border-transparent bg-[var(--green-soft)] font-medium text-[var(--green-dark)]" : "border-[var(--line)] bg-white text-[var(--muted)]"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between px-0.5">
        <p className="text-[11px] text-[var(--faint)]">系统逻辑用 code，页面只显示名称。改动实时保存到本店。</p>
        <span className="shrink-0 text-[11px] text-[var(--green-dark)]">{isSaving ? "保存中…" : savedTip}</span>
      </div>

      {/* 配置项列表 */}
      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
        {items.map((it, i) => (
          <div key={it.code} className="flex items-center gap-2 border-b border-slate-50 px-3 py-2.5 last:border-0">
            <div className="flex min-w-0 flex-1 flex-col">
              <input
                ref={(el) => {
                  (inputRefs.current[active] ||= [])[i] = el;
                }}
                value={it.name}
                onInput={(e) => rename(i, e.currentTarget.value)}
                onChange={(e) => rename(i, e.target.value)}
                onBlur={(e) => renameBlur(i, e.currentTarget.value)}
                className={`w-full rounded border border-transparent px-1 py-0.5 text-sm outline-none focus:border-slate-200 ${it.enabled ? "text-slate-800" : "text-slate-300 line-through"}`}
              />
              <span className="px-1 text-[10px] text-[var(--faint)]">{it.code} · 适用岗位：全部</span>
            </div>
            <button onClick={() => toggle(i, "visibleToStaff")} title="员工是否可见" className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] ${it.visibleToStaff ? "bg-[var(--green-soft)] text-[var(--green-dark)]" : "bg-slate-100 text-slate-400"}`}>
              {it.visibleToStaff ? "员工可见" : "仅管理"}
            </button>
            <button onClick={() => toggle(i, "enabled")} title="启用/隐藏" className={`shrink-0 ${it.enabled ? "text-[var(--green-dark)]" : "text-slate-400"}`}><VisibilityIcon enabled={it.enabled} /></button>
            <button onClick={() => move(i, -1)} title="上移" className="shrink-0 text-slate-400"><MoveIcon direction="up" /></button>
            <button onClick={() => move(i, 1)} title="下移" className="shrink-0 text-slate-400"><MoveIcon direction="down" /></button>
            <button onClick={() => remove(i)} title="删除" className="shrink-0 text-slate-400"><CloseIcon /></button>
          </div>
        ))}
        {adding ? (
          <div className="flex items-center gap-2 px-3 py-2.5">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveNew();
                if (e.key === "Escape") cancelAdd();
              }}
              placeholder="输入显示名称"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-[var(--green)]"
            />
            <button onClick={saveNew} disabled={!newName.trim()} className="shrink-0 rounded-lg bg-[var(--green-soft)] px-3 py-1.5 text-xs font-medium text-[var(--green-dark)] disabled:opacity-40">保存</button>
            <button onClick={cancelAdd} className="shrink-0 px-1.5 text-xs text-slate-400">取消</button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="w-full px-3 py-2.5 text-left text-xs text-[var(--green-dark)]">+ 新增</button>
        )}
      </div>

      <p className="px-0.5 text-[11px] text-[var(--faint)]">
        每项支持：改名、启用/隐藏、员工是否可见、排序上移/下移、删除、新增。离散操作即时保存，改名在失焦时保存（code 不变，仅换显示名）。
      </p>
    </div>
  );
}

function VisibilityIcon({ enabled }: { enabled: boolean }) {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="7.5" />{enabled && <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />}</svg>;
}

function MoveIcon({ direction }: { direction: "up" | "down" }) {
  return <svg viewBox="0 0 24 24" className={`h-4 w-4 ${direction === "down" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 14 5-5 5 5" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>;
}
