const TRACKING = /^(utm_|spm$|spm_|ref$|fbclid$|gclid$|mc_)/i;

/** Canonical article URL used for deduplication and the outbound link. */
export function canonicalUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("无效链接");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("无效链接");
  }
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}
