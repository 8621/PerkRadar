/** WebCrypto-only verifier for the pre-streaming UI gate (no Node imports). */
export async function uiAuthorized(headers: Headers, token: string, now = Date.now()): Promise<boolean> {
  const encoder = new TextEncoder();
  const bearer = headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) {
    const expected = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token)));
    const actual = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(bearer.slice(7))));
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= expected[i]! ^ actual[i]!;
    if (difference === 0) return true;
  }
  const cookie = headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("perkradar-session="))?.slice("perkradar-session=".length);
  if (!cookie || cookie.length > 200) return false;
  const parts = cookie.split(".");
  const expiry = Number(parts[0]);
  if (parts.length !== 3 || !Number.isSafeInteger(expiry) || expiry <= now || expiry > now + 8 * 3_600_000 || !/^[0-9a-f]{32}$/.test(parts[1] ?? "") || !/^[0-9a-f]{64}$/.test(parts[2] ?? "")) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(token), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signature = Uint8Array.from(parts[2]!.match(/../g)!, (byte) => parseInt(byte, 16));
  return crypto.subtle.verify("HMAC", key, signature, encoder.encode(`perkradar-session:${parts[0]}.${parts[1]}`));
}
