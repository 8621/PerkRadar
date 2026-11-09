"use client";

import "../components/deal-board.css";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="perk-board" data-testid="error">
      <div className="board-error">
        <div className="board-error-card" role="alert">
          <h1>暂时读不到优惠</h1>
          <p>页面加载失败。这里不会用示例优惠顶上，重试后会重新读取服务器里的真实结果。</p>
          <button type="button" onClick={reset} className="board-refresh" data-testid="error-retry" suppressHydrationWarning>重试</button>
        </div>
      </div>
    </div>
  );
}
