// ============================================================
// 语音转写适配层：阿里云通义 Paraformer 录音文件识别（异步任务 + 说话人分离）
// 复用 QWEN_API_KEY（DashScope 同一把 key）。走 DashScope 原生 API（非 compatible-mode）。
// 流程：submitTranscription 提交任务拿 task_id → fetchTranscription 轮询 → 完成后下载结果解析分句。
// 异步设计：提交与取结果分开，前端轮询会谈状态，避免单次请求超时。
// ============================================================

const BASE = "https://dashscope.aliyuncs.com/api/v1";

export function asrConfigured(): boolean {
  return !!process.env.QWEN_API_KEY;
}

function apiKey(): string {
  const k = process.env.QWEN_API_KEY;
  if (!k) throw new Error("未配置 QWEN_API_KEY（语音转写需要）");
  return k;
}

export interface TranscriptSegment {
  speaker: string; // speaker_0 / speaker_1 …
  start: number; // 秒
  end: number;
  text: string;
}

// 提交转写任务，返回 task_id。
// speakerCount 不传 → Paraformer 自动识别说话人数量（2 / 3 / 多人）；传了才按指定人数分。
export async function submitTranscription(fileUrl: string, speakerCount?: number): Promise<string> {
  const model = process.env.QWEN_ASR_MODEL || "paraformer-v2";
  const parameters: Record<string, any> = {
    language_hints: ["zh"],
    diarization_enabled: true,
  };
  if (typeof speakerCount === "number" && speakerCount > 0) {
    parameters.speaker_count = speakerCount;
  }
  const res = await fetch(`${BASE}/services/audio/asr/transcription`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model,
      input: { file_urls: [fileUrl] },
      parameters,
    }),
  });
  if (!res.ok) throw new Error(`ASR 提交失败 ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const taskId = data?.output?.task_id;
  if (!taskId) throw new Error("ASR 未返回 task_id：" + JSON.stringify(data));
  return taskId;
}

export type TranscriptionResult =
  | { status: "pending" }
  | { status: "done"; segments: TranscriptSegment[]; fullText: string }
  | { status: "failed"; error: string };

// 查询任务；完成则下载结果文件并解析为分句（含说话人）
export async function fetchTranscription(taskId: string): Promise<TranscriptionResult> {
  const res = await fetch(`${BASE}/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) throw new Error(`ASR 查询失败 ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const st = data?.output?.task_status;

  if (st === "PENDING" || st === "RUNNING") return { status: "pending" };
  if (st !== "SUCCEEDED") {
    return { status: "failed", error: JSON.stringify(data?.output || data).slice(0, 500) };
  }

  const results = data?.output?.results || [];
  const segments: TranscriptSegment[] = [];
  for (const r of results) {
    if (r.subtask_status && r.subtask_status !== "SUCCEEDED") continue;
    const url = r.transcription_url;
    if (!url) continue;
    try {
      const tr = await fetch(url);
      const trj = await tr.json();
      for (const t of trj.transcripts || []) {
        for (const s of t.sentences || []) {
          segments.push({
            speaker: `speaker_${s.speaker_id ?? 0}`,
            start: (s.begin_time || 0) / 1000,
            end: (s.end_time || 0) / 1000,
            text: s.text || "",
          });
        }
      }
    } catch {
      // 单个结果文件下载失败，跳过
    }
  }
  segments.sort((a, b) => a.start - b.start);
  const fullText = segments.map((s) => `[${s.speaker}] ${s.text}`).join("\n");
  return { status: "done", segments, fullText };
}
