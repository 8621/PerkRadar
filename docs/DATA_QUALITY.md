# 数据真实与时效

在架条数、健康检查和一次成功的抓取，回答的是不同问题。维护时先分清这三件事。

| 你看到的 | 它实际表示 | 它不表示 |
| --- | --- | --- |
| Docker 健康、`/api/health` 的 `ok: true` | 进程能读 SQLite | 数据新鲜，或条目现在还能领 |
| `fetchedAt` / 页面「更新」 | 最近一轮结束的时刻。全失败的一轮也会更新它 | 这一轮七个源都成功 |
| `sourceHealth.ok` 和 `failures` | 最近一轮各源是成功还是失败 | 更早某一轮的状态 |
| `deals` 里的一条 | 按下面的规则仍留在库里，并带有抓到的标题和链接 | 已经打开原文、确认活动仍有效 |
| 其他渠道留存的旧快照 | 写快照那一刻的公开字段 | 本机 SQLite 的当前内容 |

本机 Compose 没有设置 `DEALS_SNAPSHOT_DIR`。容器里通常没有 `/cursor/stores/self`，因此本机进程默认不写公开快照。外部渠道若读旧快照，和本机库不是同一份数据。

## 七个来源

URL 写死在 `src/lib/source-defs.ts`。调用方不能改地址。

| id | 名称 | URL |
| --- | --- | --- |
| `linuxdo` | LINUX DO福利羊毛 | `https://r.jina.ai/https://linux.do/c/welfare/36.rss` |
| `v2ex` | V2EX推广 | `https://www.v2ex.com/feed/promotions.xml` |
| `epic` | Epic | `https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=zh-CN&country=CN&allowCountries=CN` |
| `nodeseek` | NodeSeek | `https://rss.nodeseek.com/` |
| `appinn` | 小众软件 | `https://www.appinn.com/feed/` |
| `ghxi` | 果核剥壳 | `https://www.ghxi.com/feed` |
| `iplaysoft` | 异次元软件世界 | `https://www.iplaysoft.com/feed` |

LINUX DO 必须用上面的 Jina 地址。返回的是 Markdown，不是 RSS XML。一条要能拆出 `### [标题](https://linux.do/t/topic/<数字>)` 和 RFC822 日期，例如 `Sat, 07 Nov 2026 23:08:31 +0000`。解析不到标题、topic 链接或日期的块会丢掉。简介固定是空字符串，没有正文就不写。正文里没有 `linux.do/t/topic/` 时，这一源整轮失败，原因是「返回内容不是 LINUX DO 福利列表，可能被阻断」。不要改成直连 `linux.do` 的分类 RSS，也不要另做挑战绕过。Jina 被阻断时就让这一源失败，下一轮再试。

V2EX 必须是复数 `promotions.xml`。代码没有请求 `promotion.xml`。这是 Atom。链接上的 `#reply0` 会在规范化时去掉。

Epic 只看 `promotionalOffers` 里、当前时刻落在半开区间 `start <= now < end` 的优惠。`discountPrice` 必须是数字 0，并且折扣百分比是 0 或 100。即将开始的 `upcomingPromotionalOffers` 不读。折扣价大于 0 的不收。没有当前促销窗口的长期免费游戏也不会收，因为代码要求存在一段正在生效的免费促销；它并不单独识别「本体」和「礼包」。若一个长期免费游戏同时带有一段当前免费促销，它会进库。到期时间是这段促销的 `endDate`，入库的发布时间是 `startDate`，不是商店上架日。链接是 `https://store.epicgames.com/zh-CN/p/<slug>`。Epic 这一轮成功时，库里同来源但这次不在免费列表中的条目会删掉。这一轮失败时不删。

NodeSeek、小众软件、果核剥壳、异次元是综合 RSS/Atom。近 7 天内的条目会入库，包括闲聊和软件新闻。分类对不上关键词时记为「其他」，不会因为不确定就丢弃。页面上出现它们，只说明 feed 里有这条，不是已经确认的优惠。异次元请求的是会 301 的 `https://www.iplaysoft.com/feed`，`fetch` 使用 `redirect: "follow"`，成功时 `lastFinalUrl` 记下最终地址。不要改成只请求已经跳转后的域名，除非先改代码和测试。

每个来源超时 25 秒。一个源失败不影响其他源。响应超过 150 万字符记为失败。

## 链接、时间和不编造的字段

去领取打开的是规范化后的 URL：主机名小写、去掉 hash、去掉末尾斜杠，并删除 `utm_*`、`spm`、`ref`、`fbclid`、`gclid`、`mc_*`。同一规范化 URL 只留一行，先写入的来源保留，后来的来源跳过。

| 字段 | 从哪来 |
| --- | --- |
| `published_at` | 来源给出的时间。LINUX DO 和 RSS 用 feed 日期。Epic 用当前免费促销的开始时间。解析不了就是 `null`，不会补一个猜测日期 |
| `first_seen_at` | 本库第一次插入该链接的时刻 |
| `expires_at` | 只有 Epic 会写，取当前免费促销的结束时间。其他来源是 `null` |
| `updated_at` | 最近一次成功更新这一行的时刻 |
| 轮次 `started_at` / `finished_at` | 我们这一轮抓取的开始和结束 |
| 页面上的北京时间 | `Asia/Shanghai`，格式 `YYYY-MM-DD HH:mm`。比较和存储用 Unix 毫秒，不依赖容器时区 |

7 天窗口用 `published_at`，没有发布时间就用 `first_seen_at`。正好等于 `now - 7 天` 的仍保留，再早 1 毫秒删除。`expires_at <= now` 的删除，晚 1 毫秒的仍保留。临期红字是到期仍在未来、且不超过 48 小时。这些比较在 `src/lib/retention.ts`，并由测试覆盖。

没有简介就保持空字符串。标题最长 300 字，RSS 简介摘录最长 160 字，都来自原文纯文本，不补写。没有价格字段。标题里的额度、积分或美元是原文用词，程序不把它换算成现金，也不核实账户里是否真有这笔钱。

分类只看标题和来源，见 `src/lib/classify.ts`，先匹配先生效：

1. 来源是 Epic，或标题含 Epic / 游戏 / 喜加一 / Steam → 游戏
2. 会员 / 订阅 / 会员版 / Pro → 会员订阅
3. 限免 / 免费领取 → 限免
4. 白嫖 / 免费 / 永免 → 免费白嫖
5. 折扣 / 优惠码 / 大促 / 降价 / 打折 / 爆降 → 低价优惠
6. 其余 → 其他

拉丁词按字母边界匹配，所以 `steam98` 算 Steam，`Professional` 不算 Pro。RSS 自带栏目不参与分类。因此「免费」出现在抽奖、条件不明或闲聊标题里，也会进「免费白嫖」。这是关键词误判，不是对可领性的确认。抽奖没有单独状态。

生产库不会在启动时灌入示例数据。`tests/fixtures` 和测试名里的 SYNTHETIC 只在 `npm test` 使用。Docker 构建上下文排除了 `tests`。

## 调度和「本轮新增」

间隔是 2 小时，实现是进程里的 `setInterval`，不是浏览器计时，也不是系统 cron。Compose 没有设置 `DEALS_SKIP_BOOT`，所以容器起来约 4 秒后先抓一轮；这一轮的 `finally` 里才开始 2 小时循环。因此重启会重新排程：不会接着上次计划的剩余时间，而是尽快再抓一轮，然后从那一轮结束之后再算 2 小时。`next_refresh_at` 会被改写。

`DEALS_SKIP_BOOT=1` 会跳过这 4 秒的首轮，马上开始 2 小时循环。当前 `docker-compose.yml` 没有设置它。

进程不在跑就不会抓。笔记本休眠、Docker 没开、容器 `stop` 或崩溃，都停在原地。代码里没有补轮队列，不会按停机时长把错过的每一档都抓一遍。进程恢复后，下一次定时器触发只再跑一轮。Mac 休眠时定时器究竟何时补响，没有在用户机器上实测；能确定的是没有逐档补抓。

手动刷新和定时抓取共用一把进程内锁。正在跑时再请求得到 409。手动刷新另有 60 秒冷却和每 IP 10 分钟 8 次的限制，这两项在重启后：冷却存在 `meta.last_manual_at`，会留下来；IP 计数在内存里，重启清零。

某一源失败时，不更新该源已有行的标题、简介、发布时间和到期时间。某一源成功时，已有行会用这次抓到的非空标题更新，发布时间为空则保留旧值。Epic 成功时还会删掉不再处于免费促销中的 Epic 行。RSS 里暂时滚出列表的旧文，在 7 天和到期规则允许时仍留着。

「本轮新增」是：`first_seen_round_id` 等于最近一个已结束轮次的 id。新链接第一次插入时写下这个 id，以后不改。若后面一轮结束了且没有插入这些旧链接，它们就不再显示为本轮新增。一轮七个源都失败时，这一轮仍会结束并成为「最近一轮」，新增数是 0，旧行还在，只是不再标着上一轮的新增。这和「失败不覆盖旧标题」是两件事。

超过 3 分钟仍标记为 `running` 的轮次，会在下次读库时改成 `failed`，未完成的源记录写成「进程中断」。这不是独立的补抓。

## 新鲜度与异常提示

`/api/health` 的 `freshness` / `anomalies` 字段与页面顶栏的数据提示已经实现，见 [DEVELOPMENT.md](DEVELOPMENT.md)：

- 最近一轮结束超过 2.5 小时：`freshness.stale` 为真，提示先确认容器、Docker 与刷新状态。
- 超过 4 小时：`freshness.severe` 为真，页面上的旧条目只能当历史抓取，不能当当前可领清单。
- 上一轮全部来源失败、某源成功但解析到 0 条、某源解析条数比上一轮下降 50% 以上：写入 `anomalies`。
- 每轮结束向 stdout 输出逐源结构化日志（`[deals] {"event":"source_round",...}`），含尝试时间、完成时间、耗时、解析数、收录数、最终 URL 与失败原因。

**程序仍不会主动发送通知**（邮件、聊天、系统告警都未实现）；提示只出现在 API 与页面上。超过 4 小时应看失败原因；需要的话用 [OPERATIONS.md](OPERATIONS.md) 重启本项目，或在确认不会和正在进行的一轮重叠后手动 `POST /api/refresh`。

外部渠道若发现快照旧了，应重新读取公开 feed，不要把旧快照当成新一轮。

## 每轮验收清单

用真实的 `/api/health` 和 `/api/deals`，不要抄文档里的历史数字。

- 七个源里几个成功。失败的要有原因，而不是被算成 0 条成功。
- `fetchedAtBeijing` 距现在有多久。健康为真但时间过旧，按上一节的建议处理。
- 抽几条看发布时间是否来自 feed，Epic 的到期是否是促销结束时间。空的简介保持空。
- 打开原文核对抽到的标题和链接是否对应。至少看失败源、条数突然变很多或变成 0 的源，以及被分到「免费白嫖」「限免」但标题像闲聊或抽奖的条目。
- 条数相对上一轮大起大落时，先看是 feed 本身变了，还是解析失败、时间边界或 Epic 删除造成的。
- 某一源成功但 `lastFetched` 为 0：这是空 feed，不是自动的「抓取失败」。旧的 RSS 行是否仍在，要看 7 天规则。
