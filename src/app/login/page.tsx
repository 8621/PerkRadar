export const dynamic = "force-dynamic";
export default function LoginPage() {
  return <main style={{ maxWidth: 420, margin: "10vh auto", padding: 24 }}>
    <h1>登录 PerkRadar</h1>
    <p>输入部署时设置的访问令牌。请勿将令牌放在 URL 或公开聊天中。</p>
    <form action="/api/session" method="post">
      <label htmlFor="token">访问令牌</label>
      <input id="token" name="token" type="password" required maxLength={1024} autoComplete="current-password" />
      <button type="submit">登录（8 小时）</button>
    </form>
  </main>;
}
