"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-4">
      <h1 className="text-xl font-semibold tracking-tight">暂时读不到优惠</h1>
      <p className="mt-2 text-sm text-[#6d675e]">
        页面加载失败。这里不会用示例优惠顶上，重试后会重新读取服务器里的真实结果。
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 h-9 w-fit rounded-lg bg-[#3e5634] px-3 text-sm text-[#f7f6f1]"
      >
        重试
      </button>
    </main>
  );
}
