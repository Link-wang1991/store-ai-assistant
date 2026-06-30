"use client";

type RetryOptions = RequestInit & {
  retries?: number;
  timeoutMs?: number;
  retryStatuses?: number[];
};

const DEFAULT_RETRY_STATUSES = [408, 425, 429, 500, 502, 503, 504];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt: number) {
  return Math.min(900 * 2 ** attempt, 5000) + Math.floor(Math.random() * 250);
}

export async function fetchWithRetry(input: RequestInfo | URL, options: RetryOptions = {}) {
  const {
    retries = 2,
    timeoutMs = 45000,
    retryStatuses = DEFAULT_RETRY_STATUSES,
    ...init
  } = options;
  let lastError: any;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = timeoutMs > 0 ? new AbortController() : null;
    const timer = controller
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : null;
    try {
      const res = await fetch(input, {
        ...init,
        signal: controller ? controller.signal : init.signal,
      });
      if (!retryStatuses.includes(res.status) || attempt === retries) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (error: any) {
      lastError = error;
      if (attempt === retries) throw error;
    } finally {
      if (timer) window.clearTimeout(timer);
    }
    await sleep(retryDelay(attempt));
  }

  throw lastError || new Error("网络请求失败");
}

export async function readJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}
