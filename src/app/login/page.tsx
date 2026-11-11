import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accessToken, authorized } from "@/lib/auth";
import "@/components/deal-board.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ERRORS: Record<string, string> = {
  invalid: "令牌不对，请检查后重试。",
  rate: "尝试次数过多，请一分钟后再试。",
  request: "请求被拒绝，请在本页面重新提交。",
  config: "服务端的访问认证配置无效，请联系部署者。",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  let token: string | null = null;
  let misconfigured = false;
  try {
    token = accessToken();
  } catch {
    misconfigured = true;
  }
  // Nothing to sign in to, or already signed in: the board is the right place.
  if (!misconfigured && (token === null || authorized(new Headers(await headers()), token))) redirect("/");

  const raw = (await searchParams).error;
  const code = Array.isArray(raw) ? raw[0] : raw;
  const message = misconfigured ? ERRORS.config : code ? (ERRORS[code] ?? ERRORS.request) : null;

  return (
    <div className="perk-board" data-testid="login-root">
      <main className="board-login">
        <p className="demo-brand"><Radar aria-hidden="true" />PerkRadar</p>
        <h1>登录</h1>
        <p className="board-login-hint">输入部署时设置的访问令牌。登录后这台浏览器 8 小时内不用再输入。</p>
        {message ? <p className="board-alert" role="alert" data-testid="login-error">{message}</p> : null}
        <form action="/api/session" method="post" className="board-login-form">
          <label htmlFor="token">访问令牌</label>
          <Input id="token" name="token" type="password" required maxLength={1024} autoComplete="current-password" autoFocus data-testid="login-token" />
          <Button type="submit" data-testid="login-submit">登录</Button>
        </form>
        <p className="board-footer-note">令牌只在这里输入，不要放进网址或聊天记录。</p>
      </main>
    </div>
  );
}
