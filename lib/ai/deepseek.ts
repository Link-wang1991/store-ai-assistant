// DeepSeek 文本模型（OpenAI 兼容）：问答 / 日报 / 话术 / 员工分析

interface LLMInput {
  system: string;
  user: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

export function deepseekConfigured(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}

export async function callDeepSeek({ system, user, history }: LLMInput): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY");
  const baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
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
  if (!res.ok) throw new Error(`DeepSeek 接口错误 ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}
