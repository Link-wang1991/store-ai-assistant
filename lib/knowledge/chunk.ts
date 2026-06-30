// 文本切分：按 Markdown 标题 + 段落切分，每段控制在 ~500-1000 字（产品说明书十九章）

export interface Chunk {
  title: string;
  content: string;
}

const MAX_CHARS = 900;
const MIN_CHARS = 60;

export function chunkText(raw: string, docTitle: string): Chunk[] {
  const text = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  // 1. 先按 Markdown 标题分节
  const sections: { title: string; body: string }[] = [];
  const lines = text.split("\n");
  let curTitle = docTitle;
  let curBody: string[] = [];

  const pushSection = () => {
    const body = curBody.join("\n").trim();
    if (body) sections.push({ title: curTitle, body });
    curBody = [];
  };

  for (const line of lines) {
    const m = line.match(/^(#{1,4})\s+(.*)$/);
    if (m) {
      pushSection();
      curTitle = m[2].trim() || docTitle;
    } else {
      curBody.push(line);
    }
  }
  pushSection();

  if (sections.length === 0) {
    sections.push({ title: docTitle, body: text });
  }

  // 2. 每节按段落合并到 MAX_CHARS 以内
  const chunks: Chunk[] = [];
  for (const sec of sections) {
    const paragraphs = sec.body
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    let buf = "";
    const flush = () => {
      const content = buf.trim();
      if (content.length >= MIN_CHARS || (content && chunks.length === 0)) {
        chunks.push({ title: sec.title, content });
      } else if (content) {
        // 太短则并入上一块
        if (chunks.length > 0) {
          chunks[chunks.length - 1].content += "\n" + content;
        } else {
          chunks.push({ title: sec.title, content });
        }
      }
      buf = "";
    };

    for (const p of paragraphs) {
      if ((buf + "\n" + p).length > MAX_CHARS && buf) {
        flush();
      }
      // 单段超长则硬切
      if (p.length > MAX_CHARS) {
        for (let i = 0; i < p.length; i += MAX_CHARS) {
          chunks.push({ title: sec.title, content: p.slice(i, i + MAX_CHARS) });
        }
        continue;
      }
      buf = buf ? buf + "\n" + p : p;
    }
    flush();
  }

  return chunks.filter((c) => c.content.trim().length > 0);
}
