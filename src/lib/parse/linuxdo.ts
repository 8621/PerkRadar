import { cleanTitle } from "../text";
import type { ParsedItem } from "../types";

const DATE_PATTERN =
  /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} [+-]\d{4}\b/;

/**
 * Jina returns Markdown, not RSS XML. Each item looks like:
 * ### [title](https://linux.do/t/topic/<id>)
 * then a repeated link line, then an RFC822 date.
 * There is no body summary in this feed, so summary stays empty.
 */
export function parseLinuxDoMarkdown(markdown: string): ParsedItem[] {
  if (!markdown.includes("linux.do/t/topic/")) {
    throw new Error("返回内容不是 LINUX DO 福利列表，可能被阻断");
  }
  const chunks = markdown.split(/^### \[/m).slice(1);
  const items: ParsedItem[] = [];
  for (const chunk of chunks) {
    const titleEnd = chunk.indexOf("](");
    if (titleEnd < 0) continue;
    const title = cleanTitle(chunk.slice(0, titleEnd));
    const urlMatch = /^\]\((https?:\/\/linux\.do\/t\/topic\/\d+)\)/.exec(chunk.slice(titleEnd));
    const dateMatch = DATE_PATTERN.exec(chunk);
    if (!title || !urlMatch || !dateMatch) continue;
    const publishedAt = Date.parse(dateMatch[0]);
    if (!Number.isFinite(publishedAt)) continue;
    items.push({
      url: urlMatch[1],
      title,
      summary: "",
      publishedAt,
      expiresAt: null,
    });
  }
  if (items.length === 0) {
    throw new Error("未能从 Markdown 解析出条目");
  }
  return items;
}
