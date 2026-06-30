// Qwen 通义（OpenAI 兼容模式）：文本 / 图片识别 vision / 语音 audio（预留）

interface LLMInput {
  system: string;
  user: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

export function qwenConfigured(): boolean {
  return !!process.env.QWEN_API_KEY;
}

function baseUrl() {
  return process.env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
}

// 文本问答
export async function callQwenText({ system, user, history }: LLMInput): Promise<string> {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) throw new Error("未配置 QWEN_API_KEY");
  const model = process.env.QWEN_TEXT_MODEL || "qwen-plus";

  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      messages: [
        { role: "system", content: system },
        ...(history || []),
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Qwen 接口错误 ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// 图片识别（vision）：传入 data URL 或公网图片 URL
export async function callQwenVision(opts: {
  prompt: string;
  imageUrl: string; // data:image/...;base64,xxx 或 https://...
  system?: string;
}): Promise<string> {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) throw new Error("未配置 QWEN_API_KEY");
  const model = process.env.QWEN_VISION_MODEL || "qwen-vl-plus";

  const messages: any[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({
    role: "user",
    content: [
      { type: "text", text: opts.prompt },
      { type: "image_url", image_url: { url: opts.imageUrl } },
    ],
  });

  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) throw new Error(`Qwen Vision 接口错误 ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// 语音识别（预留：通义语音 / Qwen Audio）。第一版不实现。
export async function callQwenAudio(_opts: { audioUrl: string }): Promise<string> {
  throw new Error("语音识别暂未开放");
}
