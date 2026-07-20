// 客户名单结构化解析：csv / Excel / docx → { headers, rows } 二维表，供导入字段映射用。
// 与 parseFileToText 不同——这里要保留「列」结构，不能拍平成纯文本。

import { extFromFileName } from "./parse";

function splitCsvLine(line: string): string[] {
  return line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
}
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export interface ParsedTable {
  headers: string[];
  rows: string[][];
  note?: string; // 解析方式提示（如 docx 无表格退化为单列）
}

export async function parseTable(buffer: Buffer, fileName: string): Promise<ParsedTable> {
  const ext = extFromFileName(fileName);

  // CSV / txt：本身就是文本表格
  if (ext === "csv" || ext === "txt") {
    const lines = buffer.toString("utf-8").split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return { headers: [], rows: [] };
    return { headers: splitCsvLine(lines[0]), rows: lines.slice(1).map(splitCsvLine) };
  }

  // Excel：只接受 .xlsx；旧版 .xls 请先转换，避免继续引入有已知安全问题的解析器。
  if (ext === "xlsx") {
    const { default: readExcelFile } = await import("read-excel-file/node");
    const sheets = await readExcelFile(buffer) as Array<{ data: unknown[][] }>;
    const sheet = sheets[0];
    if (!sheet) return { headers: [], rows: [] };
    const grid = sheet.data
      .map((row) => row.map((value) => String(value ?? "").trim()))
      .filter((row) => row.some(Boolean));
    if (!grid.length) return { headers: [], rows: [] };
    return { headers: grid[0], rows: grid.slice(1) };
  }

  if (ext === "xls") throw new Error("旧版 .xls 文件请先另存为 .xlsx 后再导入。");

  // docx：客户名单一般是 Word 表格——转 HTML 抽第一个 <table> 的行列
  if (ext === "docx" || ext === "doc") {
    const mammoth = (await import("mammoth")).default ?? (await import("mammoth"));
    const html: string = (await (mammoth as any).convertToHtml({ buffer })).value || "";
    const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
    if (tableMatch) {
      const trs = tableMatch[0].match(/<tr[\s\S]*?<\/tr>/gi) || [];
      const grid = trs
        .map((tr) =>
          (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map((td) =>
            decodeEntities(td.replace(/<[^>]+>/g, "")).trim()
          )
        )
        .filter((r) => r.some((c) => c));
      if (grid.length) return { headers: grid[0], rows: grid.slice(1) };
    }
    // 没有表格 → 退化为「每行一条记录」，只能当作姓名列，提示用户
    const text: string = (await (mammoth as any).extractRawText({ buffer })).value || "";
    const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
    return {
      headers: ["姓名"],
      rows: lines.map((l: string) => [l]),
      note: "这份文档里没找到表格，已按「每行一个客户」识别为姓名。如需电话/到店等字段，建议用表格或 Excel。",
    };
  }

  return { headers: [], rows: [] };
}
