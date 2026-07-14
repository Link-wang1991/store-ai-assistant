export function decodeJwtPayload<T = any>(token: string): T | null {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (base64.length % 4)) % 4;
    const padded = base64.padEnd(base64.length + padLength, "=");
    const raw = atob(padded);
    const utf8 = decodeURIComponent(escape(raw));
    return JSON.parse(utf8) as T;
  } catch {
    return null;
  }
}
