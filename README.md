# PerkRadar

> 对外品牌统一为 `PerkRadar`。运行标识（Compose 项目名、容器名、数据卷、收藏键、端口）保持不变，避免改名导致本机状态丢失，见 [开源发布清单](docs/OPEN_SOURCE_CHECKLIST.md)。

**这是多来源优惠线索聚合，不是逐条认证的领取平台。**

服务端进程定时抓取固定来源，把标题、原文链接与必要摘要写入 SQLite，页面只展示抓到的结果。收藏和已领只存在这台浏览器，不上传、不入库。

条目出现在页面上，只表示对应 feed 里有这条，**不表示活动仍有效、领取条件已核实、账户里真有额度，也不表示我们已经打开原文逐条确认**。数据是否真实、是否还新鲜，比界面是否能打开更重要。

## 它不做什么

- 不逐条核实可领性，不验证价格、额度或资格；标题里的金额、积分、美元是原文用词，程序不换算成现金，也没有价格字段。
- **除 Epic 的当前免费促销外，没有真实截止时间**。页面上的「近 7 天」是本库的留存规则，不是活动截止日；`到期` 标签只出现在 Epic 条目上。
- 不把在架条数当成官方确认。综合 RSS/Atom 源里的闲聊、求购、抽奖、推广、条件不明的标题都会进入列表；分类只看标题关键词，会误判（例如抽奖标题可能被分到「免费白嫖」）。
- 没有简介就留空，不补写；标题最长 300 字、摘要最长 160 字，都来自原文纯文本，不存正文、Cookie 或请求头。
- 不提供公网服务。默认只监听 `127.0.0.1:38471`。**把源码上传到 GitHub 只代表代码公开，不代表网站已经公网部署。**

## 来源覆盖

七个固定来源，URL 写死在 `src/lib/source-defs.ts`，调用方不能替换：

| 来源 | 形态 |
| --- | --- |
| LINUX DO 福利羊毛 | 经 Jina 读取的 Markdown |
| V2EX 推广 | Atom |
| Epic | 静态 JSON，只取当前免费促销 |
| NodeSeek、小众软件、果核剥壳、异次元软件世界 | RSS / Atom |

综合源按 7 天窗口全量收录；Epic 只收 `start <= now < end`、折扣价为 0 的当前免费促销。同一规范化 URL 只留一行，先写入的来源保留。逐源行为与时间边界见 [docs/DATA_QUALITY.md](docs/DATA_QUALITY.md)。

原文链接一律保留。公开可访问不等于可任意再分发：各源使用条件、内容纠错与来源移除渠道见 [docs/DATA_QUALITY.md](docs/DATA_QUALITY.md) 与 [开源发布清单](docs/OPEN_SOURCE_CHECKLIST.md) §2.5。

## 刷新与时效

- 进程内定时器：启动约 4 秒先抓一轮，之后每 2 小时一轮。不是系统 cron，也不是浏览器计时。
- **停机就停**：笔记本休眠、Docker 未启动、容器停止或崩溃都会停。没有补轮队列，恢复后只再跑一轮，不会把错过的每一档补齐；重启会立刻重新抓一轮并重排下次时间。
- 单个来源有 25 秒超时，失败不影响其他来源；失败时不改写该源已有的标题和时间。
- `/api/health` 返回 `ok: true` 只说明进程能读数据库；**全失败的一轮也会更新「更新时间」**。判断新鲜度要看最近一轮结束时间与逐源成败，见 [docs/DATA_QUALITY.md](docs/DATA_QUALITY.md)。目前没有内置的过时告警。

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
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 架构、命令、API、测试、视觉验收 |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Docker 启停、排障、备份恢复、回滚 |
| [docs/DATA_QUALITY.md](docs/DATA_QUALITY.md) | 七个来源、时间边界、什么叫在架、每轮怎么验收 |
| [docs/SOURCES.md](docs/SOURCES.md) | 来源清单、使用条件核查状态、移除与纠错渠道 |
| [docs/OPEN_SOURCE_CHECKLIST.md](docs/OPEN_SOURCE_CHECKLIST.md) | 开源发布任务书与验收判据 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 开发流程、测试约定、新增来源所需证据 |
| [SECURITY.md](SECURITY.md) | 漏洞报告渠道与部署边界 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更记录 |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | 第三方依赖许可声明 |
| [AGENTS.md](AGENTS.md) | 本地维护 agent 先读什么、什么不能退让 |

这套文档描述当前源码行为。新鲜度与异常提示已实现在 `/api/health` 与页面顶栏，但程序不会主动发送邮件或聊天通知。

## 许可证

本项目采用 [MIT License](LICENSE)，允许自由使用、修改与商用，派生版本可闭源；须保留版权与许可声明。第三方依赖的义务见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。内容来自第三方站点，其使用条件不受本仓库代码许可覆盖。
