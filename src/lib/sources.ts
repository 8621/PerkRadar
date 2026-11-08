import { fetchText, type FetchLike } from "./http";
import { parseEpicFreeGames } from "./parse/epic";
import { parseFeed } from "./parse/feed";
import { parseLinuxDoMarkdown } from "./parse/linuxdo";
import { SOURCE_DEFS, type SourceDef } from "./source-defs";
import type { ParsedItem } from "./types";

export async function loadSource(
  source: SourceDef,
  ctx: { fetchImpl: FetchLike; signal: AbortSignal; now: number },
): Promise<{ items: ParsedItem[]; finalUrl: string }> {
  const fetched = await fetchText(source.url, ctx);
  if (source.id === "linuxdo") {
    return { items: parseLinuxDoMarkdown(fetched.body), finalUrl: fetched.finalUrl };
  }
  if (source.id === "epic") {
    let payload: unknown;
    try {
      payload = JSON.parse(fetched.body);
    } catch {
      throw new Error("Epic 响应不是 JSON");
    }
    return { items: parseEpicFreeGames(payload, ctx.now), finalUrl: fetched.finalUrl };
  }
  return { items: parseFeed(fetched.body), finalUrl: fetched.finalUrl };
}

export function listSources(): SourceDef[] {
  return SOURCE_DEFS;
}
