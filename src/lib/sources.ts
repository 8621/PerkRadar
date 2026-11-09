import { fetchText, type FetchLike } from "./http";
import { logEvent } from "./log";
import { parseEpicFreeGames } from "./parse/epic";
import { parseFeed } from "./parse/feed";
import { parseLinuxDoMarkdown } from "./parse/linuxdo";
import { SOURCE_DEFS, type SourceDef } from "./source-defs";
import type { ParsedItem } from "./types";
import { readFileSync } from "fs";

function readJinaApiKey(): string {
  const fromEnv = process.env.JINA_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const file = process.env.JINA_API_KEY_FILE?.trim();
  if (!file) return "";
  try {
    return readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
}

/** Feeds are untrusted: an item link pointing off-site is dropped, not published as a "claim" link. */
function onSourceDomain(items: ParsedItem[], source: SourceDef): ParsedItem[] {
  const kept = items.filter((item) => {
    try {
      const host = new URL(item.url).hostname.toLowerCase();
      return source.allowedHosts.some(
        (allowed) => host === allowed || host.endsWith(`.${allowed}`),
      );
    } catch {
      return false;
    }
  });
  const dropped = items.length - kept.length;
  if (dropped > 0) logEvent("offsite_link_dropped", { sourceId: source.id, dropped });
  return kept;
}

export async function loadSource(
  source: SourceDef,
  ctx: { fetchImpl: FetchLike; signal: AbortSignal; now: number },
): Promise<{ items: ParsedItem[]; finalUrl: string }> {
  const headers: Record<string, string> = { accept: "text/markdown" };
  const key = source.id === "linuxdo" ? readJinaApiKey() : "";
  if (key) headers.Authorization = `Bearer ${key}`;
  const fetched = source.id === "linuxdo"
    ? await fetchText(source.url, ctx, { headers })
    : await fetchText(source.url, ctx);
  let items: ParsedItem[];
  if (source.id === "linuxdo") {
    items = parseLinuxDoMarkdown(fetched.body);
  } else if (source.id === "epic") {
    let payload: unknown;
    try {
      payload = JSON.parse(fetched.body);
    } catch {
      throw new Error("Epic 响应不是 JSON");
    }
    items = parseEpicFreeGames(payload, ctx.now);
  } else {
    items = parseFeed(fetched.body, ctx.now);
  }
  return { items: onSourceDomain(items, source), finalUrl: fetched.finalUrl };
}

export function listSources(): SourceDef[] {
  return SOURCE_DEFS;
}
