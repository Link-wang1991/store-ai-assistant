import { db } from "../db";
import { toVectorLiteral } from "../ai/embedding";
import type { KnowledgeChunk } from "../types";
import type { Role } from "../constants";

// ============================================================
// 知识库检索：向量语义召回优先，失败/无命中回退中文 bigram 关键词匹配。
// 严格隔离：只检索 同 store_id + status=active + visible_roles 含当前角色 的片段
// ============================================================

// 生成中文 bigram + 英文/数字词，用于相似度计算
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const cleaned = text.toLowerCase();
  // 英文/数字连续串
  const en = cleaned.match(/[a-z0-9]{2,}/g);
  if (en) tokens.push(...en);
  // 中文 bigram
  const zh = cleaned.match(/[一-龥]+/g) || [];
  for (const seg of zh) {
    if (seg.length === 1) {
      tokens.push(seg);
    } else {
      for (let i = 0; i < seg.length - 1; i++) {
        tokens.push(seg.slice(i, i + 2));
      }
    }
  }
  return tokens;
}

const STOPWORDS = new Set([
  "怎么", "什么", "如何", "可以", "我们", "你们", "他们", "这个", "那个",
  "一下", "帮我", "请问", "需要", "应该", "就是", "的话",
]);

function scoreChunk(queryTokens: string[], content: string): number {
  if (queryTokens.length === 0) return 0;
  const lower = content.toLowerCase();
  let score = 0;
  const seen = new Set<string>();
  for (const t of queryTokens) {
    if (STOPWORDS.has(t)) continue;
    if (lower.includes(t)) {
      score += seen.has(t) ? 0.2 : 1;
      seen.add(t);
    }
  }
  return score;
}

export interface RetrievedChunk {
  id: string;
  title: string | null;
  content: string;
  category: string | null;
  score: number;
}

export async function retrieveChunks(opts: {
  storeId: string;
  role: Role;
  query: string;
  limit?: number;
  queryEmbedding?: number[] | null; // pipeline 预先算好的查询向量，避免重复调用
}): Promise<RetrievedChunk[]> {
  const { storeId, role, query, limit = 4, queryEmbedding } = opts;

  // 1) 向量语义召回优先
  if (queryEmbedding && queryEmbedding.length) {
    try {
      const rows = (await db.knowledge.matchChunks(
        storeId,
        role,
        toVectorLiteral(queryEmbedding),
        limit * 2
      )) as any[];
      if (rows.length > 0) {
        // 同一文档最多取 2 段，避免单一文档占满召回，提升来源多样性
        const perDoc: Record<string, number> = {};
        const deduped = rows
          .filter((r) => {
            const k = r.title || r.id;
            perDoc[k] = (perDoc[k] || 0) + 1;
            return perDoc[k] <= 2;
          })
          .slice(0, limit);
        return deduped.map((r) => ({
          id: r.id,
          title: r.title,
          content: r.content,
          category: r.category,
          score: typeof r.score === "number" ? r.score : 0,
        }));
      }
    } catch {
      // 向量检索不可用（未启用 pgvector / 未回填）时回退 bigram
    }
  }

  // 2) bigram 关键词兜底
  const candidates = (await db.knowledge.listRetrievable(
    storeId,
    role
  )) as unknown as KnowledgeChunk[];
  if (candidates.length === 0) return [];

  const queryTokens = Array.from(new Set(tokenize(query)));

  const scored = candidates
    .map((c) => ({
      id: c.id,
      title: c.title,
      content: c.content,
      category: c.category,
      score: scoreChunk(queryTokens, c.content + " " + (c.title || "")),
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}
