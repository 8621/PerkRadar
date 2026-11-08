const BEIJING = "Asia/Shanghai";

/** Format an instant as Beijing time `YYYY-MM-DD HH:mm` (24-hour). */
export function formatBeijing(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BEIJING,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}`;
}
