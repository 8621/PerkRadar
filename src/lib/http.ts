import { MAX_RESPONSE_CHARS, USER_AGENT } from "./config";

export type FetchLike = (
  input: string,
  init?: {
    signal?: AbortSignal;
    headers?: Record<string, string>;
    redirect?: "follow" | "manual" | "error";
  },
) => Promise<Pick<Response, "ok" | "status" | "url" | "text">>;

export async function fetchText(
  url: string,
  ctx: { fetchImpl: FetchLike; signal: AbortSignal },
): Promise<{ body: string; finalUrl: string; status: number }> {
  const response = await ctx.fetchImpl(url, {
    signal: ctx.signal,
    redirect: "follow",
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/rss+xml, application/atom+xml, application/xml, application/json, text/plain, */*",
    },
  });
  const body = await response.text();
  if (body.length > MAX_RESPONSE_CHARS) throw new Error("响应过大");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { body, finalUrl: response.url || url, status: response.status };
}

export function normalizeError(error: unknown): string {
  if (error && typeof error === "object") {
    const name = "name" in error ? String(error.name) : "";
    const message = "message" in error ? String(error.message) : "";
    if (name === "AbortError" || name === "TimeoutError" || /aborted|timeout/i.test(message)) {
      return "超时";
    }
    if (message.startsWith("HTTP ") || message) return message.slice(0, 180);
  }
  return "抓取失败";
}
