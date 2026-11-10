import { resetCircuitsForTests } from "../src/lib/source-resilience";
import { openDatabase, useDatabase } from "../src/lib/db";
import { resetGuards } from "../src/lib/guard";
import { resetRefreshLockForTests } from "../src/lib/refresh-lock";

export function useMemoryDb(): void {
  useDatabase(openDatabase(":memory:"));
  resetRefreshLockForTests();
  resetGuards();
  resetCircuitsForTests();
  process.env.DEALS_SNAPSHOT_DIR = "off";
}

export const EMPTY_RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>synthetic</title></channel></rss>`;

export function responseFor(body: string, finalUrl: string) {
  return {
    ok: true,
    status: 200,
    url: finalUrl,
    text: async () => body,
  };
}

/** SYNTHETIC linux.do markdown block. Not a live post. */
export function linuxdoItem(title: string, id: number, rfc822: string): string {
  const url = `https://linux.do/t/topic/${id}`;
  return `### [${title}](${url})\n\n[${url}](${url})  \n${rfc822}\n`;
}

/** SYNTHETIC RSS item. */
export function rssFeed(items: { title: string; link: string; pubDate: string; description?: string }[]): string {
  const body = items
    .map(
      (item) =>
        `<item><title><![CDATA[${item.title}]]></title><link>${item.link}</link><pubDate>${item.pubDate}</pubDate><description>${item.description ?? ""}</description></item>`,
    )
    .join("");
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>synthetic</title>${body}</channel></rss>`;
}

/** SYNTHETIC Atom entry. */
export function atomFeed(items: { title: string; link: string; published: string }[]): string {
  const body = items
    .map(
      (item) =>
        `<entry><title>${item.title}</title><link rel="alternate" href="${item.link}"/><published>${item.published}</published><content type="html">synthetic summary</content></entry>`,
    )
    .join("");
  return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>synthetic</title>${body}</feed>`;
}
