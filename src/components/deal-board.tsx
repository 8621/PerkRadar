"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  Clock3,
  Info,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { filterDeals, type DealSort } from "@/lib/filter-deals";
import { normalizeBoardState } from "@/lib/board-view";
import { CATEGORIES, type BoardState, type Category, type DealDTO, type SourceStatus } from "@/lib/types";
import "./deal-board.css";

// 运行标识保持不变：本机收藏和已领依赖这个键与 { claimed, favorites } 形状。
const STORAGE_KEY = "daily-deals-personal-v1";

type Personal = { claimed: string[]; favorites: string[] };
type Alert = { text: string; role: "status" | "alert"; testId: string };

const emptyPersonal: Personal = { claimed: [], favorites: [] };
// 「查看全部线索」单独存，避免改动收藏键或 { claimed, favorites } 形状。
const SHOW_ALL_KEY = "daily-deals-show-all-v1";

function loadPersonal(): Personal {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyPersonal;
    const parsed = JSON.parse(raw) as Partial<Personal>;
    return {
      claimed: Array.isArray(parsed.claimed) ? parsed.claimed.filter((item) => typeof item === "string") : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter((item) => typeof item === "string") : [],
    };
  } catch {
    return emptyPersonal;
  }
}

function loadShowAll(): boolean {
  try {
    return localStorage.getItem(SHOW_ALL_KEY) === "1";
  } catch {
    return false;
  }
}

function readError(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("error" in data)) return null;
  const value = (data as { error?: unknown }).error;
  return typeof value === "string" ? value : null;
}

function formatSourceOutcome(source: SourceStatus): string {
  if (source.lastOk == null) return "尚未抓取";
  if (source.lastOk) return `成功 ${source.lastFetched ?? 0} 条，新增 ${source.lastInserted ?? 0} 条`;
  return `失败（${source.lastError ?? "原因未记录"}），下一轮重试`;
}

function formatFailure(failure: { sourceName: string; error: string }): string {
  return `${failure.sourceName}（${failure.error}）`;
}

/** 正式首页：服务端给初始快照，客户端挂载后展开，保留真实数据和本机状态。 */
export function DealBoard({ initial }: { initial: BoardState }) {
  const [board, setBoard] = useState<BoardState>(() => normalizeBoardState(initial) ?? initial);
  const [query, setQuery] = useState("");
  const [sourceId, setSourceId] = useState<string | "all">("all");
  const [category, setCategory] = useState<Category | "all" | "favorites">("all");
  const [onlyNew, setOnlyNew] = useState(false);
  // 默认隐藏「其他」；展示偏好单独存，不写入本机收藏状态。
  const [showAllLeads, setShowAllLeads] = useState(false);
  const [sort, setSort] = useState<DealSort>("newest");
  const [personal, setPersonal] = useState<Personal>(emptyPersonal);
  const [personalReady, setPersonalReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [pollError, setPollError] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setBoard(normalizeBoardState(initial) ?? initial);
  }, [initial]);

  useEffect(() => {
    setShowAllLeads(loadShowAll());
    setPersonal(loadPersonal());
    setPersonalReady(true);
    // 另一个标签页改动本机状态后，重新读取，避免旧内存覆盖新值。
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== STORAGE_KEY && event.key !== SHOW_ALL_KEY) return;
      if (event.key === null || event.key === SHOW_ALL_KEY) setShowAllLeads(loadShowAll());
      if (event.key !== SHOW_ALL_KEY) {
        setPersonal(loadPersonal());
        setPersonalReady(true);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
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
        if (!response.ok) {
          if (!cancelled) setPollError(true);
        } else {
          const data: unknown = await response.json().catch(() => null);
          const safe = normalizeBoardState(data);
          if (!safe) {
            if (!cancelled) setPollError(true);
          } else if (!cancelled) {
            setBoard(safe);
            setPollError(false);
            if (safe.lastUpdatedAt && !safe.refreshInProgress) return;
          }
        }
      } catch {
        if (!cancelled) setPollError(true);
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStorageError(null);
      setPersonal(next);
    } catch {
      // 隐私模式或配额满时，状态和存储必须显式说明不一致，而不是静默成功。
      setStorageError("收藏和已领没能写入这台浏览器（可能是隐私模式或存储已满），本次改动只在当前页面有效。");
    }
  }

  function saveShowAll(next: boolean) {
    setShowAllLeads(next);
    try {
      localStorage.setItem(SHOW_ALL_KEY, next ? "1" : "0");
    } catch {
      // 展示偏好写入失败只影响下次打开；当前页面仍按用户选择展示。
    }
  }

  function toggle(list: "claimed" | "favorites", canonicalUrl: string) {
    const latest = loadPersonal();
    const current = new Set(latest[list]);
    if (current.has(canonicalUrl)) current.delete(canonicalUrl);
    else current.add(canonicalUrl);
    savePersonal({ ...latest, [list]: [...current] });
  }

  async function refresh() {
    setRefreshing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/refresh", { method: "POST", cache: "no-store" });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(readError(data) || "刷新没有完成");
        return;
      }
      const safe = normalizeBoardState(data);
      if (!safe) {
        setMessage("刷新结果格式异常，已保留当前列表。");
        return;
      }
      setBoard({ ...safe, refreshInProgress: false });
      setPollError(false);
    } catch {
      setMessage("网络异常，刷新没有完成");
    } finally {
      setRefreshing(false);
    }
  }

  function resetFilters() {
    setSourceId("all");
    setCategory("all");
    setQuery("");
    setOnlyNew(false);
    saveShowAll(false);
    setSort("newest");
  }

  const claimedSet = new Set(personal.claimed);
  const favoriteSet = new Set(personal.favorites);
  // 「其他」只在默认的「全部」视图隐藏；显式选分类或收藏时仍按用户选择展示。
  const hideOther = !showAllLeads && category === "all";
  const filters = { query, sourceId, category, onlyNew, sort, includeOther: !hideOther };
  const matching =
    category === "favorites" && !personalReady
      ? []
      : filterDeals(board.deals, { ...filters, includeOther: true }, personal);
  const visible =
    category === "favorites" && !personalReady
      ? []
      : filterDeals(board.deals, filters, personal);
  const hiddenOtherCount = hideOther ? matching.filter((item) => item.category === "其他").length : 0;
  const waitingForFirst = !board.lastUpdatedAt && (board.refreshInProgress || refreshing);
  const busy = refreshing || board.refreshInProgress;
  const activeFilters = [sourceId !== "all", category !== "all", query.trim().length > 0, onlyNew, sort !== "newest"].filter(Boolean).length;

  const statusItems = [
    { label: "更新", value: board.lastUpdatedLabel ? `${board.lastUpdatedLabel} 北京时间` : "尚未更新", testId: "status-update" },
    { label: "来源", value: `${board.sourceHealth.ok}/${board.sourceHealth.total}`, testId: "status-sources" },
    { label: "已收录", value: String(board.activeCount), testId: "status-active" },
    { label: "本轮新增", value: String(board.newCount), testId: "status-new" },
    { label: "下次更新", value: board.nextRefreshLabel ? `${board.nextRefreshLabel} 北京时间` : "尚未排期", testId: "status-next" },
  ];

  const alerts: Alert[] = [];
  if (pollError) alerts.push({ text: "数据暂时不可用，显示的是上次成功读取的内容；恢复后会自动更新。", role: "status", testId: "poll-error" });
  if (storageError) alerts.push({ text: storageError, role: "alert", testId: "storage-error" });
  if (message) alerts.push({ text: message, role: "alert", testId: "refresh-message" });
  if (board.anomalies?.length) alerts.push({ text: `数据提示：${board.anomalies.join("；")}`, role: "status", testId: "anomalies" });
  if (board.failures.length) alerts.push({ text: `未能抓取，下一轮重试：${board.failures.map(formatFailure).join("、")}`, role: "status", testId: "failures" });

  const categoryCounts = new Map<string, number>();
  for (const deal of board.deals) {
    categoryCounts.set(deal.category, (categoryCounts.get(deal.category) ?? 0) + 1);
  }

  const emptyMessage =
    category === "favorites" && !personalReady
      ? "正在读取这台浏览器里的收藏。"
      : pollError && board.deals.length === 0
        ? "数据暂时不可用，还无法读取条目；恢复后会自动更新，这里不会填入示例优惠。"
        : board.deals.length === 0
          ? board.lastUpdatedAt
            ? "这一轮没有已收录的条目。失败的来源会在下一轮重试，这里不会填入示例优惠。"
            : "服务端还没有完成抓取。空列表是真实状态，不会填入示例优惠。"
          : hiddenOtherCount > 0 && visible.length === 0
            ? "当前条件下只剩已隐藏的「其他」线索；打开「查看全部线索」即可查看。"
            : "没有符合当前筛选的条目。";

  if (!mounted) return <div className="perk-board" data-testid="board-root"><div className="board-loading" role="status" data-testid="loading">正在打开…</div></div>;

  return (
    <div className="perk-board" data-testid="board-root">
      <div className="demo-shell">
        <header className="demo-header" data-testid="header">
          <Link className="demo-brand" href="/" data-testid="brand"><Radar aria-hidden="true" />PerkRadar</Link>
          <div className="demo-header-actions">
            <Button className="board-refresh" data-testid="refresh" onClick={refresh} disabled={busy} aria-busy={busy}>
              <RefreshCw aria-hidden="true" />{busy ? "刷新中" : "立即刷新"}
            </Button>
          </div>
        </header>

        <div className="board-alert-strip" data-testid="alerts" aria-live="polite">
          <span className="board-lead-note" data-testid="lead-note"><ShieldCheck aria-hidden="true" />公开订阅源线索聚合，只表示抓到了这条线索；未核实活动是否仍有效、领取条件或能否领取。</span>
          {alerts.map((alert) => <p key={alert.testId} className="board-alert" role={alert.role} data-testid={alert.testId}>{alert.text}</p>)}
        </div>

        <div className="demo-layout">
          <aside className="demo-sidebar" aria-label="搜索与筛选" data-testid="sidebar">
            <button className="demo-filter-toggle" type="button" aria-expanded={mobileFiltersOpen} aria-controls="demo-filter-body" data-testid="filter-toggle" onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}>
              <SlidersHorizontal aria-hidden="true" />搜索与筛选{activeFilters ? <span className="demo-filter-count">{activeFilters}</span> : null}<ChevronDown aria-hidden="true" />
            </button>
            <div id="demo-filter-body" className="demo-filter-body" data-open={mobileFiltersOpen ? "true" : "false"}>
              <div className="demo-sidebar-head"><h2>筛选</h2><Button className="demo-reset" variant="ghost" size="sm" data-testid="reset" onClick={resetFilters}>重置</Button></div>

              <form className="demo-search" role="search" onSubmit={(event) => event.preventDefault()}>
                <label className="sr-only" htmlFor="deal-search">搜索标题</label>
                <Input id="deal-search" type="search" data-testid="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索工具、软件或关键词…" />
                <Button type="submit" size="icon" aria-label="搜索线索"><Search aria-hidden="true" /></Button>
              </form>

              <section className="demo-filter-group" aria-label="排序">
                <h3>排序</h3>
                <select className="board-sort" data-testid="sort" aria-label="排序方式" value={sort} onChange={(event) => setSort(event.target.value as DealSort)}>
                  <option value="newest">最新发布</option>
                  <option value="expiring">即将到期</option>
                </select>
              </section>

              <section className="demo-filter-group" aria-label="来源筛选">
                <h3>来源</h3>
                <div className="demo-filter-row">
                  <Pill pressed={sourceId === "all"} testId="source-chip" onClick={() => setSourceId("all")}>全部来源<span>{board.activeCount}</span></Pill>
                  {board.sources.map((source) => (
                    <Pill key={source.id} pressed={sourceId === source.id} testId="source-chip" onClick={() => setSourceId(source.id)}>{source.name}<span>{source.activeCount}</span></Pill>
                  ))}
                </div>
              </section>

              <section className="demo-filter-group" aria-label="分类筛选">
                <h3>分类</h3>
                <div className="demo-filter-row">
                  <Pill pressed={category === "all"} testId="category-chip" onClick={() => setCategory("all")}>全部</Pill>
                  {CATEGORIES.map((item) => (
                    <Pill key={item} pressed={category === item} testId="category-chip" onClick={() => setCategory(item)}>{item}<span>{categoryCounts.get(item) ?? 0}</span></Pill>
                  ))}
                  <Pill pressed={category === "favorites"} testId="category-chip" onClick={() => setCategory(category === "favorites" ? "all" : "favorites")}><Bookmark aria-hidden="true" />我的收藏<span>{personalReady ? favoriteSet.size : 0}</span></Pill>
                </div>
              </section>

              <section className="board-status" aria-label="运行状态">
                <h3>运行状态</h3>
                <dl className="board-status-list" data-testid="stats">
                  {statusItems.map((item) => <StatusItem key={item.label} label={item.label} value={item.value} testId={item.testId} />)}
                </dl>
              </section>

              <details className="board-source-results" data-testid="source-results">
                <summary><Info aria-hidden="true" />各来源本轮结果</summary>
                <ul>
                  {board.sources.map((source) => <li key={source.id}>{source.name}：{formatSourceOutcome(source)}</li>)}
                </ul>
              </details>
              <p className="board-footer-note" data-testid="footer-note">全部内容来自公开订阅源，不是逐条认证的领取清单。</p>
            </div>
          </aside>

          <main className="demo-content" data-testid="content">
            <div className="demo-results-heading" data-testid="results-heading">
              <h1>信息列表</h1>
              <span className="board-results-count" role="status" data-testid="visible-count">{visible.length} 条线索</span>
              {hiddenOtherCount > 0 ? (
                <span className="board-hidden-note" role="status" data-testid="hidden-note">已隐藏 {hiddenOtherCount} 条「其他」线索</span>
              ) : null}
              <div className="demo-results-actions">
                <label className="demo-new-toggle demo-results-toggle">
                  <input type="checkbox" data-testid="show-all" checked={showAllLeads} onChange={(event) => saveShowAll(event.target.checked)} />
                  <span className="demo-switch" aria-hidden="true" />查看全部线索
                </label>
                <label className="demo-new-toggle demo-results-toggle">
                  <input type="checkbox" data-testid="only-new" checked={onlyNew} onChange={(event) => setOnlyNew(event.target.checked)} />
                  <span className="demo-switch" aria-hidden="true" />只看新增
                </label>
              </div>
            </div>

            {waitingForFirst ? <p className="board-empty-note" role="status">正在进行首次抓取…</p> : null}

            <section className="demo-cards" aria-label="优惠列表" data-testid="cards">
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
            </section>

            {visible.length === 0 ? (
              <div className="demo-empty" data-testid="empty-state" role="status">
                <Search aria-hidden="true" />
                <h2>没有可显示的条目</h2>
                <p className="board-empty-note">{emptyMessage}</p>
                <Button variant="outline" onClick={resetFilters}>清除筛选</Button>
              </div>
            ) : null}

            <footer className="demo-footer" data-testid="footer">
              <p className="board-footer-note">默认隐藏分类为「其他」的线索；打开「查看全部线索」可查看本轮抓到的全部条目。</p>
              <p className="board-footer-note">没有到期时间的条目，从发布时刻起保留 7 天；正好满 7 天仍保留，再早 1 毫秒淘汰。有到期时间的，到点即下架。</p>
              <p className="board-footer-note">本轮新增只包含最近一轮成功写入的新链接。某一来源失败时，不会改写它已经抓到的标题和时间。</p>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}

function StatusItem({ label, value, testId }: { label: string; value: string; testId: string }) {
  return <div className="board-status-item" data-testid={testId}><dt>{label}</dt><dd>{value}</dd></div>;
}

function Pill({ pressed, onClick, children, testId }: { pressed: boolean; onClick: () => void; children: ReactNode; testId: string }) {
  return (
    <Button className="demo-pill" variant={pressed ? "default" : "outline"} aria-pressed={pressed} data-testid={testId} onClick={onClick}>
      {children}
    </Button>
  );
}

function DealCard({ deal, claimed, favorite, onClaim, onFavorite }: { deal: DealDTO; claimed: boolean; favorite: boolean; onClaim: () => void; onFavorite: () => void }) {
  return (
    <article className="demo-deal" data-claimed={claimed ? "true" : "false"} data-new={deal.isNew ? "true" : "false"} data-testid="deal-card" aria-label={deal.title}>
      <div className="deal-heading">
        <h2 data-testid="deal-title">{deal.title}</h2>
        <Button variant="ghost" className="demo-favorite" size="icon" data-testid="favorite" aria-label={`${favorite ? "取消收藏" : "收藏"}：${deal.title}`} aria-pressed={favorite} onClick={onFavorite}>
          <Bookmark aria-hidden="true" /><span>{favorite ? "已收藏" : "收藏"}</span>
        </Button>
      </div>

      <div className="deal-summary">
        <span>摘要 · 原文</span>
        <p data-testid="deal-summary">{deal.summary || "原文没有提供摘要。"}</p>
      </div>

      <details className="deal-original" data-testid="deal-original">
        <summary>原文信息</summary>
        <div className="board-original-meta" data-testid="deal-meta">
          {deal.publishedLabel ? <span><Clock3 aria-hidden="true" />发布 {deal.publishedLabel}</span> : null}
          {deal.expiresLabel ? <span><Clock3 aria-hidden="true" />到期 {deal.expiresLabel}</span> : null}
          <span>来源 {deal.sourceName}</span>
          <span>分类 {deal.category}</span>
        </div>
      </details>

      <div className="deal-tags">
        {deal.isNew ? <span className="deal-fresh" data-testid="deal-new">本轮新增</span> : null}
        <Badge variant="secondary" data-testid="deal-category">{deal.category}</Badge>
        <Badge variant="outline" data-testid="deal-source">{deal.sourceName}</Badge>
        {deal.expiresLabel ? <Badge variant={deal.expiresSoon ? "destructive" : "outline"} data-testid="deal-expiry">{deal.expiresSoon ? "临期" : "到期"} {deal.expiresLabel}</Badge> : null}
        {claimed ? <span className="deal-claimed-state" data-testid="deal-claimed">已标记已领</span> : null}
      </div>

      <div className="deal-actions">
        <Button asChild>
          <a href={deal.url} target="_blank" rel="noopener noreferrer" data-testid="open-original">打开原文<ArrowUpRight data-icon="inline-end" /></a>
        </Button>
        <Button variant="outline" data-testid="claim" aria-pressed={claimed} onClick={onClaim}>
          <Check data-icon="inline-start" />{claimed ? "撤销已领" : "标记已领"}
        </Button>
      </div>
    </article>
  );
}
