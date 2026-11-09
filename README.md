# PerkRadar

> 对外品牌统一为 `PerkRadar`。运行标识（Compose 项目名、容器名、数据卷、收藏键、端口）保持不变，避免改名导致本机状态丢失，见 [开源发布清单](docs/OPEN_SOURCE_CHECKLIST.md)。

**这是多来源优惠线索聚合，不是逐条认证的领取平台。**

服务端进程定时抓取固定来源，把标题、原文链接与必要摘要写入 SQLite，页面只展示抓到的结果。收藏和已领只存在这台浏览器，不上传、不入库。

条目出现在页面上，只表示对应 feed 里有这条，**不表示活动仍有效、领取条件已核实、账户里真有额度，也不表示我们已经打开原文逐条确认**。数据是否真实、是否还新鲜，比界面是否能打开更重要。

## 它不做什么

- 不逐条核实可领性，不验证价格、额度或资格；标题里的金额、积分、美元是原文用词，程序不换算成现金，也没有价格字段。
- **除 Epic 的当前免费促销外，没有真实截止时间**。页面上的「近 7 天」是本库的留存规则，不是活动截止日；`到期` 标签只出现在 Epic 条目上。
- 不把在架条数当成官方确认。综合 RSS/Atom 源里的闲聊、求购、抽奖、推广、条件不明的标题都会被收录并按关键词分类；分类只看标题关键词，会误判（例如抽奖标题可能被分到「免费白嫖」）。
- 分类对不上关键词时记为「其他」。「其他」只表示没有匹配到优惠关键词的线索，**不是优惠判定，也不代表已排除优惠**：与羊毛优惠无关的闲聊帖同样会归到这里。正式页「全部」视图默认隐藏「其他」条目，结果标题行显示可见条数与「已隐藏 N 条「其他」线索」，并提供「查看全部线索」开关；显式选「其他」分类或「我的收藏」时不隐藏，搜索仍受默认隐藏影响（结果为空会提示打开开关），重置回默认隐藏。这只改展示，不改收录规则与数据库；是否收紧入库关键词是尚未实施的后续选项，见 [docs/DATA_QUALITY.md](docs/DATA_QUALITY.md) 与 [docs/OPEN_SOURCE_CHECKLIST.md](docs/OPEN_SOURCE_CHECKLIST.md)。
- 没有简介就留空，不补写；标题最长 300 字、摘要最长 160 字，都来自原文纯文本。清洗会去掉 ANSI/SGR 控制序列（含只剩 `[1m` 这类残留与 `[H[J[3J` 这类裸 CSI 片段）、C0 控制字符和由 `+ * = _ ~ #` 连续 8 个以上组成的分隔线，不存正文、Cookie 或请求头。读库展示时会再做一次同样的幂等清洗，早期已入库的历史行同样生效，不改写现有数据库。
- 不提供公网服务。默认只监听 `127.0.0.1:38471`。**把源码上传到 GitHub 只代表代码公开，不代表网站已经公网部署。**

## 来源覆盖

七个固定来源，URL 写死在 `src/lib/source-defs.ts`，调用方不能替换：

| 来源 | 形态 |
| --- | --- |
| LINUX DO 福利羊毛 | 经 Jina 读取的 Markdown |
| V2EX 推广 | Atom |
| Epic | 静态 JSON，只取当前免费促销 |
| NodeSeek、小众软件、果核剥壳、异次元软件世界 | RSS / Atom |

综合源收录 7 天窗口内的条目，但每源只保留落在本源允许域名（含子域）内的链接：域名不符的条目直接丢弃，并记 `offsite_link_dropped` 日志。Epic 只收 `start <= now < end`、折扣价为 0 的当前免费促销；商品列表为空数组时视为上游异常、该源失败，不会删除库里已有的 Epic 行。同一规范化 URL 只留一行，先写入的来源保留；规范化不统一 `www.` 前缀、http/https 与路径大小写，这是已知边界。逐源行为、允许域名与时间边界见 [docs/DATA_QUALITY.md](docs/DATA_QUALITY.md)。

原文链接会先校验再保留：超过 2048 字符、含 `user:pass@` 凭证或非 http/https 协议的会被拒绝；发布时间早于 2000-01-01 或晚于当前时刻 +7 天的记为 `null`，留存改用首次收录时间；单个 feed 最多解析 2000 条；响应体累计超过 150 万字符即停止下载并记失败。公开可访问不等于可任意再分发：各源使用条件、内容纠错与来源移除渠道见 [docs/SOURCES.md](docs/SOURCES.md) 与 [docs/DATA_QUALITY.md](docs/DATA_QUALITY.md)。

## 刷新与时效

- 进程内定时器：启动约 4 秒先抓一轮，之后每 2 小时一轮。不是系统 cron，也不是浏览器计时。
- **停机就停**：笔记本休眠、Docker 未启动、容器停止或崩溃都会停。没有补轮队列，恢复后只再跑一轮，不会把错过的每一档补齐；重启会立刻重新抓一轮并重排下次时间。
- 单个来源有 25 秒超时，失败不影响其他来源；失败时不改写该源已有的标题和时间。
- `/api/health` 返回 `ok: true` 只说明进程能读数据库；**全失败的一轮也会更新「更新时间」**。判断新鲜度要看最近一轮结束时间与逐源成败，见 [docs/DATA_QUALITY.md](docs/DATA_QUALITY.md)。`/api/health` 与页面状态区和提示区会给出新鲜度与异常提示，但程序不会主动发送邮件或聊天通知。

## 页面与本地状态

- 正式首页顶部只有品牌和「立即刷新」；搜索、排序、来源、分类、收藏、运行状态与逐源结果在左侧状态区和提示区；「信息列表」标题行右侧是「查看全部线索」与「只看新增」两个开关，并显示可见条数与「已隐藏 N 条「其他」线索」。卡片只保留标题、收藏文字按钮、摘要框、原文信息、标签、「打开原文」和「标记已领」。页面是浅色底，用 `RGB(20,148,130)` 作小面积强调；未实现深色模式；使用系统字体，不加载外部字体或 CDN。
- 「全部」视图默认隐藏分类为「其他」的条目；显式选「其他」分类或「我的收藏」时不隐藏，搜索也受默认隐藏影响，结果为空会提示打开开关，重置回到默认隐藏。这只是展示过滤，所有条目仍照常入库。
- `/demo` 是**本地 dev 预览**的设计预览页，含 7 条示例（其中 1 条为「其他」，默认隐藏），只存在于源码与 dev 预览；生产镜像的构建结果只有 `/`、`/_not-found` 和三个 API，不含 `/demo`。预览页的「查看全部线索」开关只在当前页面内存生效、刷新即重置，「只看新增」仍为 3 条示例。正式页与它共用 `src/components/deal-board.css`。
- 正式页仍用 `GET /api/deals` 轮询、`POST /api/refresh` 刷新、`GET /api/health` 的数据。`src/lib/board-view.ts` 在客户端校验接口响应与 SSR 快照：拒绝 `javascript:` / `data:` / 带凭据 / 超长 URL，截断异常文本，关键结构损坏时拒绝整份数据，计数从校验后的 `deals` 推导；`filterDeals` 容忍畸形字段，搜索按字面包含匹配，并接受可选 `includeOther`（省略时沿用原有筛选行为）。
- 收藏与已领使用 `localStorage` 键 `daily-deals-personal-v1`（`{ claimed, favorites }`，形状不变）；「查看全部线索」的选择用独立键 `daily-deals-show-all-v1` 记住，刷新后保留。两者写入失败都有可见提示，并监听 `storage` 事件做跨标签同步。
- 页面持续可见地说明：条目来自公开订阅源，只表示抓到线索，未核实是否仍有效、领取条件或能否领取。
- 本地状态写入失败、轮询失败、空库、筛选为空，以及刷新 429 / 断网 / 畸形响应各有区分提示；这些空状态都不会用假条目填满。

## 本机怎么打开

在项目目录执行，默认只监听本机：

```bash
docker compose -p daily-free-info up -d --build
curl -sS http://127.0.0.1:38471/api/health
```

完整的启停、端口与备份见 [docs/OPERATIONS.md](docs/OPERATIONS.md)。数据库在当前目录的 `./data`，不要删。首次启动只会抓真实来源，不会填入示例优惠；测试夹具不会进入生产库或生产镜像。

## 文档

| 文档 | 用途 |
| --- | --- |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 架构、命令、API、结构化日志、测试、视觉验收 |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Docker 启停、排障、备份恢复、回滚 |
| [docs/DATA_QUALITY.md](docs/DATA_QUALITY.md) | 七个来源与允许域名、时间边界、收录边界、每轮怎么验收 |
| [docs/SOURCES.md](docs/SOURCES.md) | 来源清单、使用条件核查状态、移除与纠错渠道 |
| [docs/OPEN_SOURCE_CHECKLIST.md](docs/OPEN_SOURCE_CHECKLIST.md) | 开源发布当前状态与验收判据 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 开发流程、测试约定、新增来源所需证据 |
| [SECURITY.md](SECURITY.md) | 漏洞报告渠道与部署边界 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更记录 |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | 第三方依赖许可声明 |
| [docs/PERKRADAR_UI_REFACTOR_TEST_REPORT.doc.md](docs/PERKRADAR_UI_REFACTOR_TEST_REPORT.doc.md) | 界面重构测试报告（配套 .docx 由 IDE 生成） |
| [reports/ui-refactor-2026-11-09.log](reports/ui-refactor-2026-11-09.log) | 界面重构验收日志 |
| [reports/browser-adversarial-2026-11-09.log](reports/browser-adversarial-2026-11-09.log) | 浏览器异常路径验收日志 |
| [reports/default-hide-other-2026-11-09.log](reports/default-hide-other-2026-11-09.log) | 默认隐藏「其他」与「查看全部线索」验收日志 |
| [AGENTS.md](AGENTS.md) | 本地维护 agent 先读什么、什么不能退让 |

这套文档描述当前源码行为。以下边界仍然存在：不提供公网服务，**上传 GitHub ≠ 已部署**；停机不补轮、只有单实例的进程内锁；除 Epic 的当前免费促销外没有真实截止时间；新鲜度与异常只在 `/api/health` 与页面状态区和提示区提示，程序不会主动发送通知；公开快照在本机 Compose 默认关闭；收藏与已领只在这台浏览器。

## 许可证

本项目采用 [MIT License](LICENSE)，允许自由使用、修改与商用，派生版本可闭源；须保留版权与许可声明。第三方依赖的义务见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。内容来自第三方站点，其使用条件不受本仓库代码许可覆盖。
