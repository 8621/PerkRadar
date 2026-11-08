/** Structured stdout events for operators. Never logs deal bodies, cookies or personal state. */

export type LogFields = Record<string, string | number | boolean | null | undefined>;

function emit(level: "log" | "error", event: string, fields: LogFields): void {
  try {
    const line = JSON.stringify({ event, at: new Date().toISOString(), ...fields });
    if (level === "error") console.error(`[deals] ${line}`);
    else console.log(`[deals] ${line}`);
  } catch {
    console.error(`[deals] ${JSON.stringify({ event: "log_serialization_failed" })}`);
  }
}

export function logEvent(event: string, fields: LogFields = {}): void {
  emit("log", event, fields);
}

/** Keep error text short: upstream messages can be arbitrarily long or contain markup. */
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 300);
  return String(error).slice(0, 300);
}

export function logFailure(event: string, error: unknown, fields: LogFields = {}): void {
  emit("error", event, { ...fields, error: errorText(error) });
}

/** Coarse reason buckets so a failed round can be triaged without reading raw strings. */
export function classifyFailure(error: string): string {
  if (/超时|timeout|abort/i.test(error)) return "timeout";
  if (/^HTTP \d{3}/.test(error)) return "http_status";
  if (/响应过大/.test(error)) return "response_too_large";
  if (/不是 JSON|未能解析|商品列表|不是 LINUX DO|网页而不是订阅源|无效链接|格式/i.test(error)) {
    return "malformed_response";
  }
  return "unknown";
}
