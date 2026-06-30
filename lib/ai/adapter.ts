// ============================================================
// AI 适配层统一入口：根据 AI_PROVIDER 分发到 mock / deepseek / qwen。
// 文本问答走这里；mock 的具体文案由 pipeline 调 lib/ai/mock 生成。
// ============================================================

import { callDeepSeek, deepseekConfigured } from "./deepseek";
import { callQwenText, qwenConfigured } from "./qwen";

export type Provider = "mock" | "deepseek" | "qwen";

// 实际可用的 provider：选了 deepseek/qwen 但没配 key 时回退 mock
export function getProvider(): Provider {
  const p = (process.env.AI_PROVIDER || "mock").toLowerCase();
  if (p === "deepseek") return deepseekConfigured() ? "deepseek" : "mock";
  if (p === "qwen") return qwenConfigured() ? "qwen" : "mock";
  return "mock";
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

interface LLMInput {
  system: string;
  user: string;
  history?: ChatTurn[]; // 本次对话的前几轮（多轮上下文）
}

// 文本问答（mock 返回空串，由 pipeline 改走 buildMockAnswer）
export async function callLLM({ system, user, history }: LLMInput): Promise<string> {
  const p = getProvider();
  if (p === "deepseek") return callDeepSeek({ system, user, history });
  if (p === "qwen") return callQwenText({ system, user, history });
  return "";
}

// 供 /start 状态面板使用
export function providerStatus() {
  return {
    configured: (process.env.AI_PROVIDER || "mock").toLowerCase() as Provider,
    effective: getProvider(),
    deepseek: deepseekConfigured(),
    qwen: qwenConfigured(),
  };
}
