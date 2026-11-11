import { CATEGORIES } from "../src/lib/types.js";
import type { DealFilters } from "../src/lib/filter-deals.js";
import type { Personal } from "../src/lib/personal-storage.js";
import { activeDeals, formatTime, loadSnapshotBundle, loadViewerPersonal, nextBoundaryDelay, saveViewerPersonal, selectDeals, SnapshotLoadError, type ViewerSnapshot, type SnapshotStatus } from "./model.js";

/** 组件只访问静态 HTML 声明的控件；DOM 引用不跨页面复用。 */
function elements(root: HTMLElement) {
  const get = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  return {
    query: get<HTMLInputElement>("q"), source: get<HTMLSelectElement>("source"), category: get<HTMLSelectElement>("cat"),
    onlyNew: get<HTMLInputElement>("onlyNew"), onlyFavorites: get<HTMLInputElement>("onlyFav"), showAll: get<HTMLInputElement>("showAll"), reset: get<HTMLButtonElement>("reset"),
    retry: get<HTMLButtonElement>("retry"), meta: get("meta"), warning: get("warning"), storageWarning: get("storage-warning"),
    failureDetails: get<HTMLDetailsElement>("failure-details"), failureSummary: get("failure-summary"), failures: get("failures"), count: get("count"), list: get("list"),
  };
}

/** 所有快照内容都通过 textContent 写入，禁止把标题或错误拼成 HTML。 */
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** 初始化一页快照，并返回卸载时释放请求、定时器和监听器的函数。 */
export function mountSnapshotViewer(root: HTMLElement): () => void {
  const ui = elements(root);
  const listeners = new AbortController();
  const initial = loadViewerPersonal(() => window.localStorage);
  let personal: Personal = initial.personal;
  let storageWarning = initial.warning;
  let snapshot: ViewerSnapshot | null = null;
  let previous: ViewerSnapshot | null = null;
  let status: SnapshotStatus | null = null;
  let refreshError: string | null = null;
  let loading = false;
  let disposed = false;
  let inFlight: Promise<void> | null = null;
  let requestController: AbortController | null = null;
  let requestTimer: ReturnType<typeof setTimeout> | null = null;
  let boundaryTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  /** 筛选状态仅作用于当前页，来源值沿用正式看板的 sourceId。 */
  function filters(): DealFilters {
    const includeOther = ui.showAll.checked || ui.category.value !== "all" || ui.query.value.trim() !== "" || ui.onlyFavorites.checked;
    return { query: ui.query.value, sourceId: ui.source.value, category: ui.category.value as DealFilters["category"], onlyNew: ui.onlyNew.checked, includeOther };
  }

  /** 重新读取后保留仍有效的来源选择，分类使用项目共用枚举。 */
  function updateOptions(): void {
    if (!snapshot) return;
    const selected = ui.source.value;
    const sources = new Map(snapshot.items.map((item) => [item.sourceId, item.sourceName]));
    ui.source.replaceChildren(new Option("全部来源", "all"), ...[...sources].map(([id, name]) => new Option(name, id)));
    ui.source.value = sources.has(selected) ? selected : "all";
  }

  /** 新鲜度使用最后一份正常快照；全失败尝试只进入独立提示。 */
  function renderStatus(now: number): void {
    ui.storageWarning.hidden = !storageWarning;
    ui.storageWarning.textContent = storageWarning;
    const latestStatus = status && (!snapshot || status.attemptedAt >= snapshot.fetchedAt) ? status : null;
    const messages: string[] = [];
    if (snapshot) {
      const failedSnapshot = snapshot.roundStatus === "failed" || snapshot.sourceHealth.ok === 0;
      ui.meta.textContent = `${failedSnapshot ? "快照记录" : "上次正常抓取"}（北京时间）${formatTime(snapshot.fetchedAt)} · 该轮来源 ${snapshot.sourceHealth.ok}/${snapshot.sourceHealth.total} 正常`;
      if (failedSnapshot) messages.push("该快照轮次全部来源失败，记录时间不代表成功更新。");
      if (now >= snapshot.freshUntil) messages.push("快照已超过新鲜期，当前内容仅供历史参考。");
    } else {
      ui.meta.textContent = loading ? "正在读取公开快照…" : "尚未取得可用快照。";
    }
    if (latestStatus) {
      const outcome = latestStatus.roundStatus === "failed" || latestStatus.sourceHealth.ok === 0 ? "全部来源失败" : latestStatus.roundStatus === "partial" ? "部分来源失败" : "抓取完成";
      messages.push(`最近尝试（北京时间）${formatTime(latestStatus.attemptedAt)}：${outcome}，来源 ${latestStatus.sourceHealth.ok}/${latestStatus.sourceHealth.total} 正常。${latestStatus.retainedPrevious ? "本次未发布新数据，保留上次正常快照。" : ""}`);
    }
    if (refreshError) messages.push(`${refreshError}${snapshot ? " 当前继续显示已加载的快照。" : " 请重新读取，或等待发布任务生成快照。"}`);
    ui.warning.hidden = messages.length === 0;
    ui.warning.textContent = messages.join(" ");
    const recentFailures = latestStatus?.failures ?? snapshot?.failures ?? [];
    ui.failureDetails.hidden = recentFailures.length === 0;
    ui.failureSummary.textContent = `来源失败详情（${recentFailures.length}）`;
    ui.failures.replaceChildren(...recentFailures.map((failure) => node("li", "", `${failure.sourceName || failure.sourceId}：${failure.error}`)));
  }

  /** 卡片只创建经过协议与来源校验的链接，个人状态通过按钮明确表达。 */
  function renderItem(deal: ReturnType<typeof selectDeals>[number]): HTMLElement {
    const card = node("article", "snapshot-item");
    const claimed = personal.claimed.includes(deal.canonicalUrl);
    const favorite = personal.favorites.includes(deal.canonicalUrl);
    card.dataset.claimed = String(claimed);
    const title = node("h2", "");
    const link = node("a", "", deal.title);
    link.href = deal.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    title.append(link);
    card.append(title, node("p", "snapshot-item-meta", `${deal.sourceName} · ${deal.category}${deal.publishedLabel ? ` · ${deal.publishedLabel}` : " · 发布时间未知"}`));
    const tags = node("div", "snapshot-tags");
    const addTag = (text: string, kind: string) => {
      const tag = node("span", "snapshot-tag", text);
      tag.dataset.kind = kind;
      tags.append(tag);
    };
    if (deal.isNew) addTag("本轮新增", "new");
    if (deal.expiresLabel) addTag(`${deal.expiresSoon ? "即将截止" : "截止"} ${deal.expiresLabel}`, "expiry");
    if (claimed) addTag("已领", "claimed");
    if (tags.childElementCount) card.append(tags);
    const actions = node("div", "snapshot-item-actions");
    for (const [action, selected, label] of [["favorite", favorite, favorite ? "已收藏" : "收藏"], ["claim", claimed, claimed ? "已领 · 撤销" : "标记已领"]] as const) {
      const button = node("button", "snapshot-button", label);
      button.type = "button";
      button.dataset.action = action;
      button.dataset.url = deal.canonicalUrl;
      button.setAttribute("aria-pressed", String(selected));
      button.setAttribute("aria-label", `${label}：${deal.title}`);
      actions.append(button);
    }
    card.append(actions);
    return card;
  }

  /** 加载、空结果和错误共用可重试入口，错误轮询不会清空已经加载的列表。 */
  function emptyState(title: string, description: string): HTMLElement {
    const state = node("div", "snapshot-empty");
    state.append(node("h2", "", title), node("p", "", description));
    const retry = node("button", "snapshot-button", loading ? "正在读取…" : "重新读取快照");
    retry.type = "button";
    retry.dataset.action = "retry";
    retry.disabled = loading;
    state.append(retry);
    return state;
  }

  /** 每次绘制重算留存和到期；保留被操作按钮的键盘焦点。 */
  function render(): void {
    if (disposed) return;
    const now = Date.now();
    renderStatus(now);
    ui.retry.disabled = loading;
    ui.retry.textContent = loading ? "正在读取…" : "重新读取快照";
    ui.list.setAttribute("aria-busy", String(loading));
    const focused = document.activeElement instanceof HTMLButtonElement && ui.list.contains(document.activeElement) ? document.activeElement : null;
    const focusAction = focused?.dataset.action;
    const focusUrl = focused?.dataset.url;
    if (!snapshot) {
      ui.count.textContent = loading ? "正在加载…" : "尚无可展示条目";
      ui.list.replaceChildren(emptyState(loading ? "正在加载线索…" : "快照暂时不可用", "读取公开快照后即可搜索、收藏和标记已领。"));
    } else {
      const active = activeDeals(snapshot, previous, now, status);
      const shown = selectDeals(snapshot, previous, filters(), personal, now, ui.onlyFavorites.checked, status);
      ui.count.textContent = `显示 ${shown.length} / ${active.length} 条 · 本轮新增 ${active.filter((item) => item.isNew).length} 条`;
      ui.list.replaceChildren(...(shown.length ? shown.map(renderItem) : [emptyState("没有符合条件的线索", "可以调整左侧筛选，或稍后重新读取快照。过期与超过七天的条目会自动移除。") ]));
    }
    if (focusAction && focusUrl) {
      [...ui.list.querySelectorAll<HTMLButtonElement>("button[data-action]")].find((button) => button.dataset.action === focusAction && button.dataset.url === focusUrl)?.focus({ preventScroll: true });
    }
    if (boundaryTimer !== null) clearTimeout(boundaryTimer);
    boundaryTimer = null;
    if (document.visibilityState === "visible") boundaryTimer = setTimeout(render, nextBoundaryDelay(snapshot, now));
  }

  /** 多个刷新入口共用同一个请求；失败时继续展示旧数据并留下可重试提示。 */
  function refresh(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (inFlight) return inFlight;
    const controller = new AbortController();
    requestController = controller;
    requestTimer = setTimeout(() => controller.abort(), 15_000);
    loading = true;
    render();
    inFlight = loadSnapshotBundle(window.fetch.bind(window), controller.signal).then((bundle) => {
      if (disposed) return;
      snapshot = bundle.latest;
      previous = bundle.previous;
      status = bundle.status ?? (status && status.attemptedAt >= bundle.latest.fetchedAt ? status : null);
      refreshError = null;
      updateOptions();
    }).catch((error: unknown) => {
      if (disposed) return;
      if (error instanceof SnapshotLoadError && error.status) status = error.status;
      refreshError = `读取快照失败：${error instanceof Error ? error.message : "网络或数据异常"}`;
    }).finally(() => {
      if (requestTimer !== null) clearTimeout(requestTimer);
      requestTimer = null;
      inFlight = null;
      requestController = null;
      loading = false;
      render();
    });
    return inFlight;
  }

  /** 页面恢复可见或重新聚焦时先更新到期状态，再获取最新数据。 */
  function resume(): void {
    if (disposed || document.visibilityState !== "visible") return;
    render();
    void refresh();
  }

  /** 卸载和进入往返缓存时停止后台工作，避免旧响应写入已卸载页面。 */
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    listeners.abort();
    requestController?.abort();
    if (requestTimer !== null) clearTimeout(requestTimer);
    if (boundaryTimer !== null) clearTimeout(boundaryTimer);
    if (pollTimer !== null) clearInterval(pollTimer);
  }

  ui.category.replaceChildren(new Option("全部分类", "all"), ...CATEGORIES.map((category) => new Option(category, category)));
  for (const control of [ui.query, ui.source, ui.category, ui.onlyNew, ui.onlyFavorites, ui.showAll]) control.addEventListener("input", render, { signal: listeners.signal });
  ui.reset.addEventListener("click", () => {
    ui.query.value = "";
    ui.source.value = "all";
    ui.category.value = "all";
    ui.onlyNew.checked = false;
    ui.onlyFavorites.checked = false;
    ui.showAll.checked = false;
    render();
  }, { signal: listeners.signal });
  ui.retry.addEventListener("click", () => { void refresh(); }, { signal: listeners.signal });
  ui.list.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-action]") : null;
    if (!button || !ui.list.contains(button)) return;
    if (button.dataset.action === "retry") { void refresh(); return; }
    const url = button.dataset.url;
    if (!url || !snapshot?.items.some((item) => item.canonicalUrl === url)) return;
    const field = button.dataset.action === "favorite" ? "favorites" : "claimed";
    const values = personal[field];
    personal = { ...personal, [field]: values.includes(url) ? values.filter((value) => value !== url) : [...values, url] };
    storageWarning = saveViewerPersonal(() => window.localStorage, personal) ? null : "未保存：浏览器存储写入失败。当前收藏与已领仅在本页有效，刷新后可能丢失。";
    render();
  }, { signal: listeners.signal });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resume();
    else if (boundaryTimer !== null) { clearTimeout(boundaryTimer); boundaryTimer = null; }
  }, { signal: listeners.signal });
  window.addEventListener("focus", resume, { signal: listeners.signal });
  window.addEventListener("pagehide", dispose, { signal: listeners.signal });
  pollTimer = setInterval(() => { if (document.visibilityState === "visible") { render(); void refresh(); } }, 30_000);
  void refresh();
  return dispose;
}

let unmount: (() => void) | null = null;

/** 往返缓存恢复后重新挂载，避免已释放的页面停留在旧快照。 */
function boot(): void {
  const root = document.getElementById("snapshot-app");
  if (root && !unmount) unmount = mountSnapshotViewer(root);
}

window.addEventListener("pageshow", boot);
window.addEventListener("pagehide", () => { unmount?.(); unmount = null; });
boot();
