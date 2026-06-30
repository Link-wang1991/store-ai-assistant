// ============================================================
// 文本向量化适配层（语义检索底座）
// 走千问 DashScope OpenAI 兼容端点 /embeddings，model=text-embedding-v3（1024 维）。
// 复用 QWEN_API_KEY / QWEN_BASE_URL。未配置或调用失败时返回 null —— 由调用方降级回 bigram。
// 迁移其他向量模型时只改本文件（保持 1024 维或同步改 migration 的 vector 维度）。
// ============================================================

export const EMBED_DIM = 1024;

export function embedConfigured(): boolean {
  return !!process.env.QWEN_API_KEY;
}

function baseUrl(): string {
  return process.env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
}

// pgvector 字面量：[0.1,0.2,...]
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

// 批量向量化；返回与输入等长的数组，单条失败位置为 null。整体不可用时全 null。
export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  if (!embedConfigured() || texts.length === 0) return texts.map(() => null);
  const apiKey = process.env.QWEN_API_KEY!;
  const model = process.env.QWEN_EMBED_MODEL || "text-embedding-v3";
  const out: (number[] | null)[] = [];

  // text-embedding-v3 单次 batch 上限约 10 条
  for (let i = 0; i < texts.length; i += 10) {
    const batch = texts.slice(i, i + 10).map((t) => (t || "").slice(0, 2000) || " ");
    try {
      const res = await fetch(`${baseUrl()}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, input: batch, dimensions: EMBED_DIM, encoding_format: "float" }),
      });
      if (!res.ok) throw new Error(`embedding ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const items = ((data.data || []) as any[]).sort((a, b) => a.index - b.index);
      const vecs = batch.map((_, j) => (items[j]?.embedding as number[]) || null);
      out.push(...vecs);
    } catch {
      out.push(...batch.map(() => null));
    }
  }
  return out;
}

// 单条查询向量化（检索用），失败返回 null
export async function embedQuery(text: string): Promise<number[] | null> {
  const [e] = await embedTexts([text]);
  return e;
}
