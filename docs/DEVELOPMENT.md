# 开发指南

本文只写当前仓库里已经存在的行为。建议和尚未实现的改进会单独标明。

## 技术与目录

当前锁定的版本见 `package.json`：Next.js 15.5.29、React 19.1.0。生产镜像是官方 `node:22-bookworm-slim`，同时提供 `linux/amd64` 与 `linux/arm64`，Mac 上不要加 `--platform`。本机开发同样需要 Node.js 22，因为数据库用的是 Node 内置的 `node:sqlite`（实验 API，启动时会有 ExperimentalWarning）。

| 路径 | 职责 |
| --- | --- |
| `src/app/page.tsx` | 服务端读库并渲染页面 |
| `src/components/deal-board.tsx` | 筛选、排序、刷新、收藏和已领 |
| `src/components/deal-board.css` | 正式页与本地 dev 预览 `/demo` 共用的看板样式 |
| `src/app/demo/page.tsx` | 7 条示例的设计预览页（1 条「其他」默认隐藏，「只看新增」3 条，开关只在当前页内存生效、刷新重置），只在源码与 dev 预览可用，生产镜像不含此路由 |
| `src/app/api/deals/route.ts` | `GET /api/deals` |
| `src/app/api/health/route.ts` | `GET /api/health` |
| `src/app/api/refresh/route.ts` | `POST /api/refresh` |
| `src/instrumentation.ts` | Node 服务启动时登记调度 |
| `src/lib/source-defs.ts` | 七个来源的固定 URL |
| `src/lib/parse/` | LINUX DO、RSS/Atom、Epic 解析 |
| `src/lib/classify.ts` | 关键词分类 |
| `src/lib/board-view.ts` | 客户端校验 `/api/deals`、`/api/refresh` 与 SSR 快照；拒绝危险 URL 与畸形结构；计数从校验后 `deals` 推导 |
| `src/lib/filter-deals.ts` | 浏览器里的搜索、筛选和排序；容忍畸形字段，搜索字面包含；可选 `includeOther`，省略时沿用原有筛选行为 |
| `src/lib/refresh.ts` | 一轮抓取、锁、失败隔离 |
| `src/lib/scheduler.ts` | 启动后首轮和每 2 小时 |
| `src/lib/retention.ts` | 7 天和到期边界 |
| `src/lib/db.ts` | SQLite 表和读写 |
| `src/lib/snapshot.ts` | 抓取结束后的公开快照；本机 Compose 没有打开它 |
| `src/lib/config.ts` | 超时、留存、大小上限等常量 |
| `src/lib/guard.ts` | 同源校验、客户端 IP、手动刷新限流 |
| `src/lib/log.ts` | 结构化日志前缀、错误截断与失败分类 |
| `tests/` | 测试与夹具。生产镜像构建时被 `.dockerignore` 排除 |
| `scripts/live-report.ts` | 立刻再抓一轮并写 `reports/`。不是日常命令 |
| `scripts/write-snapshot.ts` | 用当前库写快照，不再次抓取 |

个人状态不在数据库里。`deal-board.tsx` 使用 `localStorage` 键 `daily-deals-personal-v1`，值是 `{ "claimed": string[], "favorites": string[] }`，元素是规范后的原文 URL。「查看全部线索」的展示偏好用独立键 `daily-deals-show-all-v1`，刷新后保留；两者都监听 `storage` 事件做跨标签同步。默认隐藏「其他」只作用于展示，不改收录规则、分类规则或数据库。本地 dev 预览 `/demo` 的同类开关只在当前页面内存生效，刷新重置。

## 命令

在项目目录：

```bash
npm ci
npm test
npm run lint
npm run build
npm run dev
npm run start
```

`npm test` 使用 `node --import tsx --test tests/*.test.ts`。`npm run report` 会访问外网并写入本机库，只在确实要再抓一轮时使用。

Docker 的构建和启停见 [OPERATIONS.md](OPERATIONS.md)。

## 开发进程和生产进程

两边都由 `src/instrumentation.ts` 在 Node 运行时调用 `startScheduler()`。构建阶段会跳过：`NEXT_PHASE=phase-production-build` 或 `npm_lifecycle_event=build`。`DISABLE_SCHEDULER=1` 会完全不调度。

`npm run dev` 是 `next dev`，带 Turbopack，监听 `0.0.0.0:38471`。热更新用 `globalThis` 避免重复登记定时器。开发时数据库默认是项目下的 `data/deals.db`。

生产容器执行的是镜像里的 `npm run start`，也就是 `next start`，容器内端口固定 38471。Compose 把宿主的 `127.0.0.1:${HOST_PORT:-38471}` 转到这个端口。`DATA_DIR=/data`，对应宿主的 `./data`。

`next.config.mjs` 是普通 JavaScript，只设置 `serverExternalPackages: ["node:sqlite"]`。Dockerfile 在 `npm run build` 之后执行 `npm prune --omit=dev`。若仍使用 `next.config.ts`，`next start` 发现没有 TypeScript 就会联网安装它。这是已经修掉的启动行为，不要改回 `.ts` 配置。

依赖审计：生产依赖 `npm audit --omit=dev` 为 0 项；完整 `npm audit` 的 11 项全部在开发依赖里（`shadcn` 的 `deepmerge`、`typescript-eslint` / `ts-morph` 的 `minimatch`）。不加 `--force` 的 `npm audit fix` 消不掉它们，`--force` 会把 `shadcn` 换成不兼容的大版本，因此不要用它。CI 已显式指定官方 registry；本机默认 npm 镜像不支持 audit 端点，本地复查要手动加 `--registry=https://registry.npmjs.org`（如 `npm audit --omit=dev --registry=https://registry.npmjs.org`）。依赖或锁文件变更后必须重新跑，不能把任何一次结果写成永久保证。

工程配置：`package.json` 声明 `engines.node >=22`，`.nvmrc` 为 22，两个 workflow 固定 Node 22。`tsconfig.json` 与 `eslint.config.mjs` 都排除 `deployment-backups/`：那里有展开的旧 `next.config.ts`，会被 `include: **/*.ts` 扫到。`.dockerignore` 额外排除根目录 `*.md` 与 `scripts/`，镜像仍以 `node`（uid 1000）非 root 运行。两个 workflow 声明 `permissions: contents: read`；`live-sources.yml` 的 cron 用 UTC（`23 4 * * *` 即北京时间 12:23）。Next 仍锁 15.5.29、ESLint 仍 9，没有升级大版本。

## API

三个接口都带 `cache-control: no-store`。时间在 `/api/deals` 里是 Unix 毫秒；`/api/health` 里的时刻是 ISO 字符串，北京时间标签是 `YYYY-MM-DD HH:mm`。

### `GET /api/health`

数据库能读时 HTTP 200，主体由 `toHealthReport()` 生成：

```json
{
  "ok": true,
  "fetchedAt": "2026-01-01T00:00:00.000Z",
  "fetchedAtBeijing": "2026-01-01 08:00",
  "sourceHealth": { "ok": 7, "total": 7 },
  "failures": [],
  "refreshInProgress": false,
  "activeCount": 0,
  "newCount": 0,
  "nextRefreshAt": null,
  "nextRefreshLabelBeijing": null,
  "freshness": { "lastRoundAgeMs": null, "stale": false, "severe": false },
  "anomalies": []
}
```

`freshness` 用最近一轮结束时刻计算：超过 2.5 小时 `stale` 为真，超过 4 小时 `severe` 为真。`anomalies` 收录「尚未完成任何一轮」「数据过时」「上一轮全失败」「某源成功但 0 条」「某源解析条数骤降」「连续失败达到 3 轮」「解析结构异常」等文字提示，页面状态区和提示区会显示。逐源 `quality` 汇总每源近 8 条已结束轮次；历史查询最多读取 32 条，不增加数据库表。连续失败在最近一次成功后清零，条数相对上一轮下降至少 50% 时告警，识别到已知解析/响应格式错误时标记结构异常。逐源结果与失败分类写入结构化日志，见本文「结构化日志」章节。

上面的数字只说明字段形状。`ok: true` 不是数据新鲜，也不是每条可领。`fetchedAt` 来自最近一轮已结束记录的 `finished_at`，这一轮即使全部失败也会更新它。`sourceHealth.ok` 只数这一轮里 `lastOk === true` 的来源。读库抛错时 HTTP 503，主体是 `{ "ok": false, "error": "数据库不可读" }`。

### `GET /api/deals`

返回 `BoardState`。字段与 `src/lib/types.ts` 一致：

- `generatedAt`：这次读库的时刻。
- `lastUpdatedAt` / `lastUpdatedLabel`：最近一轮结束时刻。还没有任何一轮时为 `null`。
- `nextRefreshAt` / `nextRefreshLabel`：调度器写入的下一次计划。没有写过则为 `null`。
- `sourceHealth`、`activeCount`、`newCount`、`refreshInProgress`。
- `roundStatus`：`success`、`partial`、`failed`，或还没有结束轮时 `null`。
- `failures`：这一轮失败来源的 `sourceId`、`sourceName`、`error`。
- `sources`：固定 7 个来源。`lastOk` 在从未跑过时是 `null`。`lastFetched` 是解析出的条数，`lastInserted` 是这一轮新插入的条数，`lastFinalUrl` 是跟随重定向后的最终 URL；可选 `quality` 提供近 8 轮连续失败数、条数骤降、解析结构异常和简短告警。旧响应没有 `quality` 时客户端按无告警兼容处理。
- `deals`：当前在架条目。`isNew` 表示它的 `first_seen_round_id` 等于最近一轮已结束的 id。`expiresSoon` 表示到期时刻在 48 小时内且仍晚于现在。`summary` 没有正文时是空字符串。
- `freshness`：`lastRoundAgeMs`、`stale`（超过 2.5 小时）、`severe`（超过 4 小时）。
- `anomalies`：数据过时、上一轮全失败、某源成功但 0 条、某源解析条数骤降、连续失败达到 3 轮和解析结构异常等文字提示。

读库抛错时 HTTP 503，主体是 `{ "error": "数据库不可读" }`，并记 `deals_read_failed` 日志；与 `/api/health` 的降级一致。成功响应的字段不变。

### `POST /api/refresh`

没有请求体。成功时 HTTP 200，主体同样是 `BoardState`，并且 `refreshInProgress` 在返回前已经清掉。

| HTTP | 何时 | 主体 |
| --- | --- | --- |
| 409 | 已有一轮在跑 | `{ "error": "已有刷新进行中" }` |
| 429 | 距上次手动刷新不足 60 秒，或同一 IP 10 分钟内超过 8 次 | `{ "error": "刷新过于频繁，请稍后再试" }` 或 `{ "error": "手动刷新过于频繁，请稍后再试" }`，并带 `retry-after` |
| 403 | 带 `sec-fetch-site: cross-site`，或 `Origin` 的主机和请求的 `Host` 不一致 | `{ "error": "拒绝跨站刷新" }` 等 |
| 400 | `Content-Length` 大于 2048 | `{ "error": "请求无效" }` |
| 500 | 其他未分类错误 | `{ "error": "刷新失败" }` |

不带 `Origin` 的请求仍放行，[OPERATIONS.md](OPERATIONS.md) 的本机 `curl` 排障命令依赖这一点。客户端 IP 默认一律归为 `local`，忽略 `x-forwarded-for` / `x-real-ip`；只有 `TRUST_PROXY_HEADERS=1` 时才信任转发头，详见 [SECURITY.md](../SECURITY.md)。这些防护都不是身份校验。

定时抓取不走这个 60 秒冷却，但会和手动抓取共用进程内的锁。锁只在一个 Node 进程里有效，所以不能开第二个容器。

## 结构化日志

抓取、读库与刷新接口都输出单行 JSON，统一前缀 `[deals] `，便于 `grep` 与容器日志采集。每行都有 `event` 和 `at`（ISO 时刻）；成功事件走 stdout（`console.log`），失败事件走 stderr（`console.error`）。日志**不写标题正文、Cookie、请求头、正文内容或个人状态**，错误文本截断到 300 字。

在本机看：

```bash
docker compose -p daily-free-info logs -f --tail=200
```

按事件名过滤：

```bash
docker compose -p daily-free-info logs --no-color 2>&1 | grep '\[deals\]'
```

一轮抓取通常留下 1 条 `round_start`、7 条 `source_round` 和 1 条 `round_finished`；某源丢弃跨域名链接时另有 `offsite_link_dropped`。`source_round` 是写库事务提交、输出 `round_finished` 之后才按轮次逐条补写的，所以这 7 行的 `at` 与 `round_finished.at` 常常只差几毫秒，不代表抓取先后；各源真正的起止时间看 `attemptedAt` / `completedAt` 与 `durationMs`。`roundId` 与 `rounds` 表的 id 一致，把下面命令里的 37 换成要查的轮次即可：

```bash
docker compose -p daily-free-info logs --no-color --tail=400 2>&1 | grep '\[deals\]' | grep '"roundId":37'
docker compose -p daily-free-info logs --no-color --tail=400 2>&1 | grep '"ok":false'
docker compose -p daily-free-info logs --no-color --tail=400 2>&1 | grep '"event":"round_finished"' | tail -10
```

日志里的 `at` 是 UTC 的 ISO 时刻，`/api/health` 的 `fetchedAt` 也是 UTC；页面上的 `fetchedAtBeijing` 与 `lastUpdatedLabel` 按 `Asia/Shanghai` 显示，相差 8 小时不是故障。容器不设 `TZ`。

| 事件 | 流向 | 字段 | 含义 |
| --- | --- | --- | --- |
| `round_start` | stdout | `trigger`（`manual` / `schedule`）、`sources` | 一轮开始，来源总数 |
| `round_finished` | stdout | `roundId`、`trigger`、`status`（`success` / `partial` / `failed`）、`okSources`、`totalSources`、`inserted` | 一轮结束，成功源数与新插入条数 |
| `source_round` | stdout | `roundId`、`sourceId`、`ok`、`attemptedAt`、`completedAt`、`durationMs`、`parsed`、`inserted`、`finalUrl`、`error`、`reason` | 每源逐条结果；`attemptedAt` / `completedAt` 是 ISO 时刻，`error` 是截断的错误文本，`ok` 为真时 `reason` 为 `null` |
| `offsite_link_dropped` | stdout | `sourceId`、`dropped` | 该源丢弃了多少条不在允许域名内的链接 |
| `round_write_failed` | stderr | `trigger`、`error` | 一轮写库事务失败并回滚 |
| `snapshot_write_failed` | stderr | `error` | 公开快照写入失败 |
| `deals_read_failed` | stderr | `error` | `GET /api/deals` 读库失败 |
| `health_check_failed` | stderr | `error` | `GET /api/health` 读库失败 |
| `manual_refresh_ok` | stdout | `roundStatus`、`activeCount` | 手动刷新成功 |
| `manual_refresh_rejected` | stdout | `code`、`status` | 被限流 / 冷却 / 同源防护拒绝；`code` 为 `rate_limit`、`guard`，或 `BUSY` / `COOLDOWN` |
| `manual_refresh_failed` | stderr | `error` | 手动刷新出现未分类错误 |
| `scheduled_refresh_skipped` | stdout | `reason` | 定时轮次因已有刷新正在运行而跳过 |
| `scheduled_refresh_failed` | stderr | `error` | 定时轮次出现未分类错误 |

`/api/health` 与 `/api/deals` 的轮次字段和日志同源：`fetchedAt` / `lastUpdatedAt` 是最近一次 `round_finished` 的结束时刻，`sourceHealth.ok` 是该轮 `ok: true` 的 `source_round` 数，`sources[].lastFetched` / `lastInserted` / `lastFinalUrl` / `lastError` 分别对应 `parsed` / `inserted` / `finalUrl` / `error`。`quality` 与 `anomalies` 是读库时按最近几轮历史算出来的，没有单独的日志事件；`nextRefreshAt` 由调度器写入，也不写日志。接口只给当前状态，逐轮细节回到日志看。

手动刷新被拒绝时，`manual_refresh_rejected.status` 就是接口返回的 HTTP 状态，`code` 表示拦在哪一层：

| `code` | `status` | 触发条件 |
| --- | --- | --- |
| `guard` | 403 / 400 | 同源校验失败，或 `Content-Length` 超过 2048 |
| `rate_limit` | 429 | 同一 IP 10 分钟内触发超过 8 次 |
| `COOLDOWN` | 429 | 距上次手动刷新不足 60 秒 |
| `BUSY` | 409 | 已有一轮抓取在跑 |

`manual_refresh_ok` 只在手动轮成功时输出，带 `roundStatus` 与 `activeCount`；定时轮没有这条事件。

`source_round.reason` 是对失败错误的粗分类，排查时不必读原始错误串：

| 值 | 匹配的失败 |
| --- | --- |
| `timeout` | 超时、连接被 abort |
| `http_status` | `HTTP <三位数字>` 形式的状态错误 |
| `response_too_large` | 「响应过大」 |
| `malformed_response` | 不是 JSON、解析失败、Epic 商品列表异常、不是 LINUX DO 列表、返回网页而非订阅源、无效链接、格式错误 |
| `unknown` | 其余未归类错误 |

失败事件除表中字段外还带 `error`。失败原因要看 `source_round.reason` 与 `error`，不要只看 `round_finished.status`。每轮验收清单见 [DATA_QUALITY.md](DATA_QUALITY.md)。

`docker compose logs` 只读当前容器。`up -d --build` 重建容器后，旧容器的日志不再可见；容器重启也会重新排程，日志里会出现一轮新的 `trigger: "schedule"`，轮次 id 接着库里已有的 id 递增，不从 1 开始。需要留档就先导出到仓库外：

```bash
mkdir -p "$HOME/free-info-archives"
docker compose -p daily-free-info logs --no-color > "$HOME/free-info-archives/deals-$(date +%Y%m%d-%H%M%S).log"
```

仓库忽略 `reports/` 与 `*.log`，不要把日志提交进版本库；日志说明写在文档里。

## 本地修改流程

1. 先看 `/api/health` 和页面，记下改之前的来源数和最后更新时间。
2. 改代码。解析和分类的预期放进 `tests/`，夹具可以是合成的，但必须留在测试里。
3. 依次跑 `npm test` → `npm run lint` → `npx --no-install tsc --noEmit` → `npm run build`。动到页面就在 1440、1280 和 390 宽度下看真实数据，不要只看编译；验收顺序见 [.mrdayone/verify.md](../.mrdayone/verify.md)，结果见 [界面重构测试报告](PERKRADAR_UI_REFACTOR_TEST_REPORT.doc.md)（配套 .docx 由 IDE 生成）与 [reports/browser-adversarial-2026-11-09.log](../reports/browser-adversarial-2026-11-09.log)。
4. 生产依赖有变动时再跑 `npm audit --omit=dev --registry=https://registry.npmjs.org` 和完整的 `npm audit --registry=https://registry.npmjs.org`。本机默认 npm 镜像不支持审计端点。
5. 需要更新容器时用 [OPERATIONS.md](OPERATIONS.md) 里只针对 `daily-free-info` 的命令。不要把 `./data` 放进镜像，也不要用测试库覆盖它。

仓库已在本目录初始化（`main` 分支），远端见 `git remote -v`。只操作本项目，不要动其他目录的容器、端口或卷。

## 视觉验收

这是改界面之后要人眼看的标准，不是现成的自动测试。改布局之后必须重新看，不能用一次历史验收代替。验收顺序、真实数据与异常路径见 [.mrdayone/verify.md](../.mrdayone/verify.md)，重构验收记录见 [界面重构测试报告](PERKRADAR_UI_REFACTOR_TEST_REPORT.doc.md)（配套 .docx 由 IDE 生成）、[reports/ui-refactor-2026-11-09.log](../reports/ui-refactor-2026-11-09.log)、[reports/browser-adversarial-2026-11-09.log](../reports/browser-adversarial-2026-11-09.log) 与 [reports/default-hide-other-2026-11-09.log](../reports/default-hide-other-2026-11-09.log)。

正式首页按 `/demo` 的布局：顶部只有品牌与「立即刷新」；搜索、排序、来源、分类、收藏、运行状态与逐源结果在左侧状态区和提示区；「信息列表」标题行右侧是「查看全部线索」与「只看新增」两个开关，并显示可见条数与「已隐藏 N 条「其他」线索」；卡片只保留标题、收藏文字按钮、摘要框、原文信息、标签、「打开原文」与「标记已领」。`/demo` 是本地 dev 预览的设计预览页（7 条示例，其中 1 条「其他」默认隐藏，「只看新增」仍为 3 条，开关只在当前页面内存生效、刷新重置），只在源码与 dev 预览可用；生产镜像的构建结果只有 `/`、`/_not-found` 和三个 API，不含 `/demo`。正式页与它共用 `src/components/deal-board.css`。

- 1440px 和 1280px：左侧为筛选与状态栏，主区为「信息列表」卡片；左栏文字不重叠、不裁切。不要退回成居中的窄手机条。
- 390px：单列，无横向溢出；顶部信息不裁切、卡片底部控件不溢出；来源和类别不要堆成好几屏才能看到第一条。
- 浅色底，`RGB(20,148,130)` 只作小面积强调；未实现深色模式；系统字体，不从外部字体或 CDN 加载。
- 顶部只有品牌和「立即刷新」；刷新中按钮禁用并显示「刷新中」。左侧状态区能看到北京时间、来源成功数、已收录数、本轮新增与逐源结果；冷却或失败时有红色说明。页面持续可见地说明条目来自公开订阅源、只是抓到的线索、未核实有效性 / 条件 / 能否领取。
- 交互逐项看：搜索标题（字面包含）、排序、点一个来源、点一个类别、只看本轮新增、收藏、标记已领、立即刷新、重置、刷新后状态保留。已领卡片变灰并排到列表后面。刷新页面后，`daily-deals-personal-v1` 与 `daily-deals-show-all-v1` 还在；写入失败有可见提示，另一个标签页的改动会通过 `storage` 事件同步过来。
- 默认隐藏「其他」逐项看：「全部」视图首屏可见条数与「已隐藏 N 条「其他」线索」提示；点「查看全部线索」后显示所有条目；与「只看新增」组合；显式点「其他」分类或「我的收藏」时不隐藏；搜索仍受默认隐藏影响、结果为空会提示打开开关；重置回到默认隐藏；刷新后开关保留。这只是展示过滤，收录规则、分类规则与数据库都不变。本地 `/demo` 的 7 条示例默认隐藏 1 条「其他」，开关刷新即重置。
- 异常路径用浏览器 `route` 改写 `/api/refresh`：恶意标题 / 链接、空库、畸形结构、429、断网；逐项确认页面保留旧内容或显示明确提示，不出现空白和假条目。客户端 `src/lib/board-view.ts` 拒绝 `javascript:` / `data:` / 带凭据 / 超长 URL，截断异常文本，关键结构坏时拒绝整份数据，计数从校验后 `deals` 推导。
- 空库、筛选为空、轮询接口失败、本地状态写入失败各有区分提示，不能用假条目填上，也不能让几种状态看起来一样。
- 命令与浏览器验收记录：`npm test`、`npm run lint`、`npx --no-install tsc --noEmit`、`git diff --check` 通过，1280 桌面 / 390 手机预览无控制台报错、无失败请求、无关键视觉缺陷，390px 无横向溢出。测试项数以 `npm test` 输出为准，验收日志见本节开头。
