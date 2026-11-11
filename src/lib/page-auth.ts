import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authorized } from "./auth";
export async function requirePageAuth(): Promise<void> {
  if (!authorized(new Headers(await headers()))) redirect("/login");
}
