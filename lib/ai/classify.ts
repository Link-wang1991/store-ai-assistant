import { callLLM } from "./adapter";

// 知识资料自动分类：给定门店现有分类 + 资料内容，让 AI 归类。
// 原则：优先落到已有分类，只有内容明显不属于任何现有分类时才提议新分类名。
// 失败/兜底时返回 existing[0]（绝不让上传中断）。
export async function classifyKnowledge(
  title: string,
  text: string,
  existing: string[]
): Promise<{ category: string; isNew: boolean }> {
  const fallback = existing[0] || "未分类";
  const cats = existing.filter(Boolean);
  if (cats.length === 0) return { category: fallback, isNew: false };

  const sample = (text || "").slice(0, 1500);
  const system =
    "你是美容/医美门店的知识库管理员，负责把上传的资料归到最合适的分类。" +
    "优先使用已有分类；只有当资料内容明显不属于任何已有分类时，才提议一个简短（2-6字）的新分类名。" +
    '只输出 JSON：{"category":"分类名","isNew":true/false}，不要任何多余文字。';
  const user =
    `已有分类（优先从中选）：${cats.join("、")}\n\n` +
    `资料标题：${title}\n资料内容（节选）：\n${sample}\n\n` +
    `请判断这份资料最该归到哪个分类。能归到已有分类就归（isNew=false）；` +
    `实在不属于任何已有分类才新建（isNew=true，给一个简短分类名）。`;

  try {
    const raw = await callLLM({ system, user });
    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}");
    if (s < 0 || e <= s) return { category: fallback, isNew: false };
    const obj = JSON.parse(raw.slice(s, e + 1));
    const cat = String(obj.category || "").trim();
    if (!cat) return { category: fallback, isNew: false };
    // 命中已有分类（容忍前后空格差异）→ 用已有的，避免生成近似重复分类
    const matched = cats.find((c) => c === cat || c.trim() === cat.trim());
    if (matched) return { category: matched, isNew: false };
    // 对不上任何已有分类 → 当成新分类
    return { category: cat, isNew: true };
  } catch {
    return { category: fallback, isNew: false };
  }
}
