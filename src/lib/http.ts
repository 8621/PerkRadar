import { MAX_RESPONSE_CHARS, USER_AGENT } from "./config";

type MinimalHeaders = { get(name: string): string | null };

type FetchedResponse = Pick<Response, "ok" | "status" | "url" | "text"> & {
  body?: ReadableStream<Uint8Array> | null;
  headers?: MinimalHeaders;
};

export type FetchLike = (
  input: string,
  init?: {
    signal?: AbortSignal;
    headers?: Record<string, string>;
    redirect?: "follow" | "manual" | "error";
  },
) => Promise<FetchedResponse>;

/** Stop downloading as soon as the cap is crossed. `text()` alone reads the whole body first. */
async function readLimitedBody(response: FetchedResponse): Promise<string> {
  const declared = Number(response.headers?.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_CHARS) throw new Error("响应过大");
  if (!response.body) {
    // Test doubles and engines without a stream still get the same cap.
    const body = await response.text();
    if (body.length > MAX_RESPONSE_CHARS) throw new Error("响应过大");
    return body;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
      if (body.length > MAX_RESPONSE_CHARS) {
        await reader.cancel().catch(() => {});
        throw new Error("响应过大");
      }
    }
    body += decoder.decode();
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The stream was already cancelled by the size guard.
    }
  }
  if (body.length > MAX_RESPONSE_CHARS) throw new Error("响应过大");
  return body;
}

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
  // Reject error statuses before downloading their (potentially huge) body.
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await readLimitedBody(response);
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
