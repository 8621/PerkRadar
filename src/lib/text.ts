import { SUMMARY_MAX, TITLE_MAX } from "./config";

function decodeEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, digits: string) => {
      const code = Number(digits);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    });
}

/** Decode entities, drop tags and terminal noise, collapse whitespace. Does not invent text. */
export function toPlain(input: string): string {
  const decoded = decodeEntities(input);
  return decoded
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, " ")
    // Some feeds strip the ESC byte but leave the SGR sequence behind, e.g. "[1m".
    .replace(/\[[0-9;]{1,8}m/g, " ")
    // Same for cursor/screen CSI fragments such as "[H[J[3J" in terminal dumps.
    // Restrict the final byte to H/J/K so ordinary text like "[3D]" survives.
    .replace(/\[[0-9;]{0,4}[HJK]/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ")
    // Long runs of separator glyphs are ASCII-art padding, not summary content.
    .replace(/[+*=_~#]{8,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanTitle(input: string): string {
  return toPlain(input).slice(0, TITLE_MAX);
}

export function excerpt(input: string, max = SUMMARY_MAX): string {
  const plain = toPlain(input);
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max).trimEnd()}…`;
}
