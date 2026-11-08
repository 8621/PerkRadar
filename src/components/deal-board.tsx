"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { filterDeals, type DealSort } from "@/lib/filter-deals";
import { CATEGORIES, type BoardState, type Category, type DealDTO } from "@/lib/types";

const STORAGE_KEY = "daily-deals-personal-v1";

type Personal = { claimed: string[]; favorites: string[] };

const emptyPersonal: Personal = { claimed: [], favorites: [] };

function loadPersonal(): Personal {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyPersonal;
    const parsed = JSON.parse(raw) as Partial<Personal>;
    return {
      claimed: Array.isArray(parsed.claimed) ? parsed.claimed.filter((item) => typeof item === "string") : [],
      favorites: Array.isArray(parsed.favorites)
        ? parsed.favorites.filter((item) => typeof item === "string")
        : [],
    };
  } catch {
    return emptyPersonal;
  }
}

export function DealBoard({ initial }: { initial: BoardState }) {
  const [board, setBoard] = useState(initial);
  const [query, setQuery] = useState("");
  const [sourceId, setSourceId] = useState<string | "all">("all");
  const [category, setCategory] = useState<Category | "all" | "favorites">("all");
  const [onlyNew, setOnlyNew] = useState(false);
  const [sort, setSort] = useState<DealSort>("newest");
  const [personal, setPersonal] = useState<Personal>(emptyPersonal);
  const [personalReady, setPersonalReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setBoard(initial);
  }, [initial]);

  useEffect(() => {
    setPersonal(loadPersonal());
    setPersonalReady(true);
  }, []);

  useEffect(() => {
    if (initial.lastUpdatedAt && !initial.refreshInProgress) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled || attempts >= 15) return;
      attempts += 1;
      try {
        const response = await fetch("/api/deals", { cache: "no-store" });
        if (response.ok) {
          const data = (await response.json()) as BoardState;
          if (!cancelled) setBoard(data);
          if (data.lastUpdatedAt && !data.refreshInProgress) return;
        }
      } catch {
        // Keep the empty or previous board visible.
      }
      if (!cancelled) timer = setTimeout(tick, 2000);
    };
    timer = setTimeout(tick, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [initial]);

  function savePersonal(next: Personal) {
    setPersonal(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function toggle(list: "claimed" | "favorites", canonicalUrl: string) {
    const current = new Set(personal[list]);
    if (current.has(canonicalUrl)) current.delete(canonicalUrl);
    else current.add(canonicalUrl);
    savePersonal({ ...personal, [list]: [...current] });
  }

  async function refresh() {
    setRefreshing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/refresh", { method: "POST", cache: "no-store" });
      const data = (await response.json()) as BoardState & { error?: string };
      if (!response.ok) {
        setMessage(data.error || "刷新没有完成");
        return;
      }
      setBoard({ ...data, refreshInProgress: false });
    } catch {
      setMessage("网络异常，刷新没有完成");
    } finally {
      setRefreshing(false);
    }
  }

  const claimedSet = new Set(personal.claimed);
  const favoriteSet = new Set(personal.favorites);
  const visible =
    category === "favorites" && !personalReady
      ? []
      : filterDeals(board.deals, { query, sourceId, category, onlyNew, sort }, personal);
  const waitingForFirst = !board.lastUpdatedAt && (board.refreshInProgress || refreshing);
  const busy = refreshing || board.refreshInProgress;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-[#e4ddd2] bg-[#f6f3ee]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 lg:px-6">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-[#1c2118] sm:text-xl">PerkRadar</h1>
            <p className="text-xs text-[#6d675e]">多来源优惠线索聚合 · 收藏和已领只在这台浏览器</p>
          </div>
          <div
            data-testid="stats"
            className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-sm"
            aria-live="polite"
          >
            <Status
              label="更新"
              value={board.lastUpdatedLabel ? `${board.lastUpdatedLabel} 北京时间` : "尚未更新"}
            />
            <Status label="来源" value={`${board.sourceHealth.ok}/${board.sourceHealth.total}`} />
            <Status label="在架" value={String(board.activeCount)} />
            <Status label="本轮新增" value={String(board.newCount)} />
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              data-testid="refresh"
              onClick={refresh}
              disabled={busy}
              aria-busy={busy}
              className="h-9 rounded-lg bg-[#3e5634] px-3.5 text-sm text-[#f7f6f1] hover:bg-[#334a2b] disabled:opacity-60"
            >
              {busy ? "刷新中" : "立即刷新"}
            </Button>
          </div>
        </div>
        {board.nextRefreshLabel ? (
          <p className="mx-auto hidden max-w-[1360px] px-4 pb-2 text-xs text-[#6d675e] lg:block lg:px-6">
            下次自动更新 {board.nextRefreshLabel}（北京时间）
          </p>
        ) : null}
        {message ? (
          <p className="mx-auto max-w-[1360px] px-4 pb-2 text-xs text-[#b42318] lg:px-6" role="alert">
            {message}
          </p>
        ) : null}
        {board.anomalies && board.anomalies.length > 0 ? (
          <p
            data-testid="anomalies"
            className="mx-auto max-w-[1360px] px-4 pb-2 text-xs text-[#b42318] lg:px-6"
            role="status"
          >
            数据提示：{board.anomalies.join("；")}
          </p>
        ) : null}
        {board.failures.length > 0 ? (
          <p
            data-testid="failures"
            className="mx-auto max-w-[1360px] px-4 pb-2 text-xs text-[#b42318] lg:px-6"
            role="status"
          >
            未能抓取，下一轮重试：
            {board.failures.map((failure) => `${failure.sourceName}（${failure.error}）`).join("、")}
          </p>
        ) : null}
      </header>

      <div className="mx-auto grid w-full max-w-[1360px] gap-6 px-4 py-5 lg:grid-cols-[252px_minmax(0,1fr)] lg:px-6">
        <aside className="hidden lg:block">
          <div className="sticky top-[4.5rem] space-y-5">
            <FilterGroup label="快捷">
              <ToggleRow pressed={onlyNew} onClick={() => setOnlyNew((value) => !value)} testId="only-new">
                只看本轮新增
                <span className="ml-auto tabular-nums text-[#6d675e]">{board.newCount}</span>
              </ToggleRow>
              <ToggleRow
                pressed={category === "favorites"}
                onClick={() => setCategory(category === "favorites" ? "all" : "favorites")}
                testId="category-chip"
              >
                我的收藏
                <span className="ml-auto tabular-nums text-[#6d675e]">{personalReady ? favoriteSet.size : ""}</span>
              </ToggleRow>
            </FilterGroup>
            <FilterGroup label="来源">
              <ToggleRow pressed={sourceId === "all"} onClick={() => setSourceId("all")} testId="source-chip">
                全部
                <span className="ml-auto tabular-nums text-[#6d675e]">{board.activeCount}</span>
              </ToggleRow>
              {board.sources.map((source) => (
                <ToggleRow
                  key={source.id}
                  pressed={sourceId === source.id}
                  onClick={() => setSourceId(source.id)}
                  testId="source-chip"
                >
                  <span className="truncate">{source.name}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-[#6d675e]">{source.activeCount}</span>
                </ToggleRow>
              ))}
            </FilterGroup>
            <FilterGroup label="类别">
              <ToggleRow pressed={category === "all"} onClick={() => setCategory("all")} testId="category-chip">
                全部
              </ToggleRow>
              {CATEGORIES.map((item) => (
                <ToggleRow key={item} pressed={category === item} onClick={() => setCategory(item)} testId="category-chip">
                  {item}
                </ToggleRow>
              ))}
            </FilterGroup>
            <details className="text-xs leading-5 text-[#6d675e]">
              <summary className="cursor-pointer font-medium text-[#2a3124]">各来源本轮结果</summary>
              <ul className="mt-2 space-y-1.5">
                {board.sources.map((source) => (
                  <li key={source.id}>
                    {source.name}：
                    {source.lastOk == null
                      ? "尚未抓取"
                      : source.lastOk
                        ? `成功 ${source.lastFetched ?? 0} 条，新增 ${source.lastInserted ?? 0} 条`
                        : `失败（${source.lastError}），下一轮重试`}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-3 space-y-2 lg:hidden">
            <div className="flex gap-2">
              <Chip pressed={onlyNew} onClick={() => setOnlyNew((value) => !value)} testId="only-new">
                只看新增 {board.newCount}
              </Chip>
              <Chip
                pressed={category === "favorites"}
                onClick={() => setCategory(category === "favorites" ? "all" : "favorites")}
                testId="category-chip"
              >
                我的收藏 {personalReady ? favoriteSet.size : ""}
              </Chip>
            </div>
            <ChipRail label="来源">
              <Chip pressed={sourceId === "all"} onClick={() => setSourceId("all")} testId="source-chip">
                全部 {board.activeCount}
              </Chip>
              {board.sources.map((source) => (
                <Chip
                  key={source.id}
                  pressed={sourceId === source.id}
                  onClick={() => setSourceId(source.id)}
                  testId="source-chip"
                >
                  {source.name} {source.activeCount}
                </Chip>
              ))}
            </ChipRail>
            <ChipRail label="类别">
              <Chip pressed={category === "all"} onClick={() => setCategory("all")} testId="category-chip">
                全部
              </Chip>
              {CATEGORIES.map((item) => (
                <Chip key={item} pressed={category === item} onClick={() => setCategory(item)} testId="category-chip">
                  {item}
                </Chip>
              ))}
            </ChipRail>
          </div>

          <form
            role="search"
            className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center"
            onSubmit={(event) => event.preventDefault()}
          >
            <div className="min-w-0 flex-1">
              <label htmlFor="deal-search" className="sr-only">
                搜索标题
              </label>
              <Input
                id="deal-search"
                data-testid="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题"
                className="h-10 rounded-lg border-[#e4ddd2] bg-[#fffcf8]"
              />
            </div>
            <label className="flex h-10 items-center gap-2 rounded-lg border border-[#e4ddd2] bg-[#fffcf8] px-3 text-sm">
              <span className="text-[#6d675e]">排序</span>
              <select
                data-testid="sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as DealSort)}
                className="bg-transparent font-medium outline-none"
              >
                <option value="newest">最新发布</option>
                <option value="expiring">即将到期</option>
              </select>
            </label>
            <p className="shrink-0 text-sm text-[#6d675e] sm:ml-1">显示 {visible.length}</p>
          </form>

          <section aria-label="优惠列表">
            {waitingForFirst ? (
              <p className="mb-3 text-sm text-[#6d675e]" role="status">
                正在进行首次抓取…
              </p>
            ) : null}
            {visible.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#d9d1c5] bg-[#fffcf8] px-4 py-10 text-center">
                <p className="font-semibold tracking-tight">没有可显示的条目</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-[#6d675e]">
                  {category === "favorites" && !personalReady
                    ? "正在读取这台浏览器里的收藏。"
                    : board.deals.length === 0
                      ? board.lastUpdatedAt
                        ? "这一轮没有仍在架的条目。失败的来源会在下一轮重试，这里不会填入示例优惠。"
                        : "服务端还没有完成抓取。空列表是真实状态，不会填入示例优惠。"
                      : "没有符合当前筛选的条目。"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {visible.map((deal) => (
                  <DealCard
                    key={deal.canonicalUrl}
                    deal={deal}
                    claimed={personalReady && claimedSet.has(deal.canonicalUrl)}
                    favorite={personalReady && favoriteSet.has(deal.canonicalUrl)}
                    onClaim={() => toggle("claimed", deal.canonicalUrl)}
                    onFavorite={() => toggle("favorites", deal.canonicalUrl)}
                  />
                ))}
              </div>
            )}
          </section>
          <footer className="mt-8 max-w-3xl space-y-1 text-xs leading-5 text-[#6d675e]">
            <p>没有到期时间的条目，从发布时刻起保留 7 天；正好满 7 天仍保留，再早 1 毫秒淘汰。有到期时间的，到点即下架。</p>
            <p>本轮新增只包含最近一轮成功写入的新链接。某一来源失败时，不会改写它已经抓到的标题和时间。</p>
          </footer>
        </div>
      </div>
    </div>
  );
}

function DealCard({
  deal,
  claimed,
  favorite,
  onClaim,
  onFavorite,
}: {
  deal: DealDTO;
  claimed: boolean;
  favorite: boolean;
  onClaim: () => void;
  onFavorite: () => void;
}) {
  const emphasis = deal.category !== "其他";
  return (
    <article
      data-testid="deal-card"
      data-claimed={claimed ? "true" : "false"}
      data-new={deal.isNew ? "true" : "false"}
      className={
        claimed
          ? "flex flex-col rounded-xl border border-[#e4ddd2] bg-[#f3efe8] p-4 opacity-70 shadow-sm"
          : "flex flex-col rounded-xl border border-[#e7e1d8] bg-[#fffcf8] p-4 shadow-sm transition-colors hover:border-[#c9d3bf]"
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {deal.isNew ? (
          <span className="rounded-full bg-[#e7f0df] px-2 py-0.5 text-xs font-medium text-[#2f4528]">本轮新增</span>
        ) : null}
        <span
          className={
            emphasis
              ? "text-sm font-medium text-[#3e5634]"
              : "text-sm text-[#6d675e]"
          }
        >
          {deal.category}
        </span>
        {deal.expiresLabel ? (
          <span className={deal.expiresSoon ? "text-xs font-medium text-[#b42318]" : "text-xs text-[#6d675e]"}>
            {deal.expiresSoon ? "临期" : "到期"} {deal.expiresLabel}
          </span>
        ) : null}
      </div>
      <h2 className="mt-2 text-[15px] font-semibold leading-6 tracking-tight text-[#1c2118]">{deal.title}</h2>
      {deal.summary ? <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-[#6d675e]">{deal.summary}</p> : null}
      {deal.publishedLabel ? <p className="mt-1 text-xs text-[#8a847b]">发布 {deal.publishedLabel}</p> : null}
      <div className="mt-3 border-t border-[#eee7de] pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto rounded-full border border-[#e4ddd2] px-2 py-0.5 text-xs text-[#5c564e]">
            {deal.sourceName}
          </span>
          <Button
            asChild
            className="h-8 rounded-lg bg-[#3e5634] px-3 text-sm text-[#f7f6f1] hover:bg-[#334a2b]"
          >
            <a href={deal.url} target="_blank" rel="noopener noreferrer">
              去领取
              <span className="sr-only">，新标签打开原文</span>
            </a>
          </Button>
          <button
            type="button"
            data-testid="favorite"
            aria-pressed={favorite}
            onClick={onFavorite}
            className="h-8 rounded-lg px-2 text-sm text-[#3e5634] hover:bg-[#eef3e8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d8b58]"
          >
            {favorite ? "已收藏" : "收藏"}
          </button>
          <button
            type="button"
            data-testid="claim"
            aria-pressed={claimed}
            onClick={onClaim}
            className="h-8 rounded-lg px-2 text-sm text-[#5c564e] hover:bg-[#f3efe8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d8b58]"
          >
            {claimed ? "取消已领" : "已领"}
          </button>
        </div>
      </div>
    </article>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <p className="whitespace-nowrap">
      <span className="text-[#8a847b]">{label}</span>{" "}
      <span className="font-semibold tracking-tight text-[#1c2118]">{value}</span>
    </p>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 text-xs font-medium tracking-tight text-[#8a847b]">{label}</h2>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function ToggleRow({
  pressed,
  onClick,
  children,
  testId,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-testid={testId}
      onClick={onClick}
      className={
        pressed
          ? "flex h-8 w-full items-center gap-2 rounded-lg bg-[#3e5634] px-2.5 text-left text-sm text-[#f7f6f1]"
          : "flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-[#1c2118] hover:bg-[#efeae2]"
      }
    >
      {children}
    </button>
  );
}

function ChipRail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
      {children}
    </div>
  );
}

function Chip({
  pressed,
  onClick,
  children,
  testId,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-testid={testId}
      onClick={onClick}
      className={
        pressed
          ? "h-8 shrink-0 rounded-full bg-[#3e5634] px-3 text-sm text-[#f7f6f1]"
          : "h-8 shrink-0 rounded-full border border-[#e4ddd2] bg-[#fffcf8] px-3 text-sm text-[#1c2118]"
      }
    >
      {children}
    </button>
  );
}
