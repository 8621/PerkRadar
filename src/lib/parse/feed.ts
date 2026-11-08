import { XMLParser } from "fast-xml-parser";
import { FUTURE_PUBLISH_TOLERANCE_MS, MAX_FEED_ITEMS, MIN_PUBLISH_MS } from "../config";
import { cleanTitle, excerpt } from "../text";
import type { ParsedItem } from "../types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  trimValues: true,
  textNodeName: "#text",
});

function nodeText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).filter(Boolean).join(" ");
  if (typeof node === "object") {
    const record = node as Record<string, unknown>;
    if ("#text" in record) return nodeText(record["#text"]);
  }
  return "";
}

function linkHref(node: unknown): string {
  if (typeof node === "string") return node.trim();
  if (Array.isArray(node)) {
    const alternate = node.find(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        (entry as Record<string, unknown>)["@_rel"] === "alternate",
    );
    return linkHref(alternate ?? node[0]);
  }
  if (node && typeof node === "object") {
    const href = (node as Record<string, unknown>)["@_href"];
    if (typeof href === "string") return href.trim();
    return nodeText(node).trim();
  }
  return "";
}

function asList(node: unknown): unknown[] {
  if (node == null) return [];
  return Array.isArray(node) ? node : [node];
}

function parseTime(value: unknown, now: number): number | null {
  const text = nodeText(value).trim();
  if (!text) return null;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  // A future or implausible date would pin an item to the top and never expire.
  if (ms < MIN_PUBLISH_MS || ms > now + FUTURE_PUBLISH_TOLERANCE_MS) return null;
  return ms;
}

function itemFromRecord(record: Record<string, unknown>, now: number): ParsedItem | null {
  const title = cleanTitle(nodeText(record.title));
  const url = linkHref(record.link);
  if (!title || !url) return null;
  const summarySource =
    nodeText(record.description) || nodeText(record.summary) || nodeText(record.encoded) || nodeText(record.content);
  const publishedAt =
    parseTime(record.pubDate, now) ?? parseTime(record.published, now) ?? parseTime(record.updated, now) ?? parseTime(record.date, now);
  return {
    url,
    title,
    summary: excerpt(summarySource),
    publishedAt,
    expiresAt: null,
  };
}

/** Parse RSS 2.0 or Atom. HTML challenge pages fail instead of becoming deals. */
export function parseFeed(xml: string, now = Date.now()): ParsedItem[] {
  const head = xml.slice(0, 400).toLowerCase();
  if (head.includes("<!doctype html") || /<html[\s>]/.test(head)) {
    throw new Error("返回的是网页而不是订阅源，可能被阻断");
  }
  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch {
    throw new Error("未能解析 RSS/Atom");
  }
  const root = parsed as {
    rss?: { channel?: { item?: unknown } };
    feed?: { entry?: unknown };
  };
  const rssItems = root.rss?.channel ? asList(root.rss.channel.item) : null;
  const atomEntries = root.feed ? asList(root.feed.entry) : null;
  const records = rssItems ?? atomEntries;
  if (!records) throw new Error("未能解析 RSS/Atom");
  const items: ParsedItem[] = [];
  // A hostile feed can contain unbounded entries; cap work per source.
  for (const record of records.slice(0, MAX_FEED_ITEMS)) {
    if (!record || typeof record !== "object") continue;
    const item = itemFromRecord(record as Record<string, unknown>, now);
    if (item) items.push(item);
  }
  return items;
}
