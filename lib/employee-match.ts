// 把表格里写的「负责人」匹配到门店员工——只认「姓名」，岗位/括号一律忽略。
// 例：「小美（咨询师）」只取「小美」去和员工姓名比对，不拿「咨询师」做任何匹配。

export function normEmpName(s: string): string {
  return (s || "")
    .replace(/[（(][^)）]*[)）]/g, "")               // 去掉括号及其中内容（岗位等），只留姓名
    .replace(/[\s ​‌　﻿]/g, "") // 去掉各种空白：普通/不间断/零宽/全角/BOM
    .trim();
}

export function matchEmployeeId(
  raw: string,
  emps: { id: string; name: string }[]
): string | null {
  const t = normEmpName(raw);
  if (!t) return null;
  // 只按姓名精确相等匹配（去掉括号岗位、空格后），不做子串/模糊匹配，避免误判
  for (const e of emps) if (normEmpName(e.name) === t) return e.id;
  return null;
}

// 字符级编辑距离（用于员工姓名只差一字时的疑似匹配）
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

// 疑似匹配：精确对不上时，找一个「形近」的员工（同长度、仅差 1 个字）作为「疑似」候选，
// 用于提示/确认，绝不自动分配。返回 null 表示连疑似都没有。
export function suggestEmployee(
  raw: string,
  emps: { id: string; name: string }[]
): { id: string; name: string } | null {
  const t = normEmpName(raw);
  if (!t) return null;
  let best: { id: string; name: string; d: number } | null = null;
  for (const e of emps) {
    const en = normEmpName(e.name);
    if (!en || en === t) continue;
    const d = editDistance(t, en);
    // 仅 1 个字之差、且长度接近，才算「疑似」（避免乱猜）
    if (d <= 1 && Math.abs(en.length - t.length) <= 1) {
      if (!best || d < best.d) best = { id: e.id, name: e.name, d };
    }
  }
  return best ? { id: best.id, name: best.name } : null;
}
