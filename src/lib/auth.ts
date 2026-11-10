import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
export const SESSION_COOKIE = "perkradar-session";
const SESSION_MS = 8 * 60 * 60 * 1000;
export function accessToken(): string | null {
  const token = process.env.PERKRADAR_ACCESS_TOKEN;
  if (token === undefined || token === "") return null;
  if (token.length < 32) throw new Error("PERKRADAR_ACCESS_TOKEN 至少需要 32 个字符");
  return token;
}
function equal(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}
export function validToken(value: string, token: string): boolean { return equal(value, token); }
function sign(payload: string, token: string): string { return createHmac("sha256", token).update(`perkradar-session:${payload}`).digest("hex"); }
export function createSession(token: string, now = Date.now()): string {
  const payload = `${now + SESSION_MS}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${sign(payload, token)}`;
}
export function validSession(cookie: string, token: string, now = Date.now()): boolean {
  if (cookie.length > 200) return false;
  const parts = cookie.split(".");
  const expiry = Number(parts[0]);
  if (parts.length !== 3 || !Number.isSafeInteger(expiry) || expiry <= now || expiry > now + SESSION_MS || !/^[0-9a-f]{32}$/.test(parts[1] ?? "")) return false;
  return equal(parts[2]!, sign(parts.slice(0, 2).join("."), token));
}
export function authorized(headers: Headers, token = accessToken(), now = Date.now()): boolean {
  if (!token) return true;
  const bearer = headers.get("authorization");
  if (bearer?.startsWith("Bearer ") && validToken(bearer.slice(7), token)) return true;
  const cookie = headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  return Boolean(cookie && validSession(cookie, token, now));
}
export function authFailure(request: Request): NextResponse | null {
  try {
    if (authorized(request.headers)) return null;
    return NextResponse.json({ error: "需要登录或 Bearer token" }, { status: 401, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "访问认证配置无效" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
