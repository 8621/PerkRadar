/** Seven days, measured in milliseconds. Equality with the cutoff is still kept. */
export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Real server interval. Not a browser timer. */
export const REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;

/** Delay before the first scheduled round after the process starts. */
export const SCHEDULER_BOOT_DELAY_MS = 4_000;

/** Manual refresh cooldown. Scheduled runs are not subject to it. */
export const MANUAL_COOLDOWN_MS = 60_000;

/** Per-source network timeout. One slow source does not extend the others. */
export const SOURCE_TIMEOUT_MS = 25_000;

/** Expiry badge turns red inside this window. */
export const EXPIRING_SOON_MS = 48 * 60 * 60 * 1000;

/** Manual attempts allowed per IP inside the window below. */
export const MANUAL_IP_LIMIT = 8;
export const MANUAL_IP_WINDOW_MS = 10 * 60 * 1000;

/** A round still marked running after this is treated as interrupted. */
export const DANGLING_ROUND_MS = 3 * 60 * 1000;

/** Freshness thresholds surfaced by /api/health and the page banner. */
export const STALE_AFTER_MS = 2.5 * 60 * 60 * 1000;
export const SEVERE_AFTER_MS = 4 * 60 * 60 * 1000;

export const USER_AGENT = "Mozilla/5.0 (compatible; DailyDealsBot/1.0)";
export const MAX_RESPONSE_CHARS = 1_500_000;
export const SUMMARY_MAX = 160;
export const TITLE_MAX = 300;
