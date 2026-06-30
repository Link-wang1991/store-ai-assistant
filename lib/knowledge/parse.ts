// 文件解析：md/txt/docx/pdf/xlsx/csv/pptx/图片 → 纯文本（服务端运行）

import { callQwenVision, qwenConfigured } from "../ai/qwen";

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "bmp", "gif", "image"];

export async function parseFileToText(
  buffer: Buffer,
  fileType: string,
  fileName: string
): Promise<string> {
  const type = (fileType || fileName.split(".").pop() || "").toLowerCase();

  // 纯文本 md/txt
  if (type.includes("md") || type.includes("txt") || type.includes("markdown") || type.includes("plain")) {
    return buffer.toString("utf-8");
  }

  // docx
  if (type.includes("doc")) {
    const mammoth = (await import("mammoth")).default ?? (await import("mammoth"));
    const result = await (mammoth as any).extractRawText({ buffer });
    return result.value || "";
  }

  // pdf
  if (type.includes("pdf")) {
    // 直接引用内部实现，避免 pdf-parse 顶层加载测试文件
    // @ts-ignore pdf-parse 子路径无类型声明
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const result = await pdfParse(buffer);
    return result.text || "";
  }

  // CSV 本身就是文本，直接按 UTF-8 读，避免 SheetJS 读 buffer 的中文编码问题
  if (type.includes("csv")) {
    return buffer.toString("utf-8");
  }

  // Excel（SheetJS）：每个 sheet 转为 CSV 文本
  if (type.includes("xls") || type.includes("sheet")) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      if (csv.trim()) parts.push(wb.SheetNames.length > 1 ? `【${name}】\n${csv}` : csv);
    }
    return parts.join("\n\n");
  }

  // PPT（officeparser v7 返回 AST，用 toText() 取纯文本）
  if (type.includes("ppt")) {
    const { parseOffice } = await import("officeparser");
    const ast: any = await (parseOffice as any)(buffer);
    if (ast && typeof ast.toText === "function") return ast.toText() || "";
    return typeof ast === "string" ? ast : "";
  }

  // 图片：走千问 Vision 做 OCR，提取图中文字
  if (IMAGE_EXTS.some((e) => type.includes(e))) {
    if (!qwenConfigured()) {
      throw new Error("图片识别需要配置 QWEN_API_KEY（千问 Vision）");
    }
    const mime = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "jpeg";
    const dataUrl = `data:image/${mime};base64,${buffer.toString("base64")}`;
    const text = await callQwenVision({
      prompt: "请把这张图片里的所有文字一字不漏地提取出来，按原始排版输出为纯文字，不要做任何解释、翻译或总结。",
      imageUrl: dataUrl,
    });
    return text || "";
  }

  // 兜底按 utf-8 文本处理
  return buffer.toString("utf-8");
}

export function extFromFileName(name: string): string {
  return (name.split(".").pop() || "").toLowerCase();
}

export const SUPPORTED_EXTS = [
  "md", "txt", "docx", "pdf",
  "xlsx", "xls", "csv", "pptx",
  "jpg", "jpeg", "png", "webp",
];
