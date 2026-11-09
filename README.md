# PerkRadar

PerkRadar 是一个本地运行的优惠线索聚合器。它定时读取固定的公开 RSS、Atom、JSON 和 Markdown 来源，把标题、原文链接和短摘要整理到一个轻量的 SQLite 数据库，再用网页看板帮助你搜索、筛选、收藏和标记已领。

它的定位是“先把线索集中起来”，不是逐条认证的领取平台。页面里的一条记录只代表对应来源曾返回过这条内容，不代表活动仍然有效、领取条件已经核实、账户一定有额度，也不代表 PerkRadar 已经打开原文逐条确认。使用时请把原文页面作为最终依据。

## 快速开始

### 环境要求

- Node.js 22 或更高版本
- npm
- 如果使用 Docker，需要 Docker Desktop 或兼容 Docker Compose 的环境

Node.js 22 是必需条件，因为项目使用了 Node 内置的 `node:sqlite`。依赖版本锁在 `package-lock.json` 中。

### 用 Docker 运行

这是推荐的本机运行方式。它会构建生产镜像、启动容器，并把 SQLite 数据保存在项目目录的 `./data` 中。

```bash
docker compose -p daily-free-info up -d --build
```

打开 [http://127.0.0.1:38471/](http://127.0.0.1:38471/)，或先检查服务健康状态：

```bash
curl -sS http://127.0.0.1:38471/api/health
```

默认只绑定到本机回环地址 `127.0.0.1`，不会自动提供公网访问。宿主端口被占用时，只替换宿主端口，容器内端口仍保持 `38471`：

```bash
HOST_PORT=38481 docker compose -p daily-free-info up -d --build
```

此时访问 [http://127.0.0.1:38481/](http://127.0.0.1:38481/)。完整的启停、日志、备份、恢复和回滚说明见 [docs/OPERATIONS.md](docs/OPERATIONS.md)。

### 用 npm 开发

```bash
npm ci
npm run dev
```

开发服务器监听 `0.0.0.0:38471`，打开 [http://127.0.0.1:38471/](http://127.0.0.1:38471/)。开发模式默认使用项目目录下的 `data/deals.db`，首次运行会从真实来源抓取，不会灌入示例优惠。

本地设计预览页 `/demo` 只在开发环境提供，用于查看界面布局和交互示例：

[http://127.0.0.1:38471/demo](http://127.0.0.1:38471/demo)

生产镜像不包含 `/demo` 路由。

## 页面能做什么

- 按标题搜索，使用字面包含匹配
- 按来源和分类筛选，并支持排序
- 查看本轮新增
- 收藏条目、标记已领
- 打开规范化后的原文链接
- 手动触发刷新，并查看刷新冷却、来源成功数和异常提示
- 查看当前在架条目、最近一轮状态、逐来源结果和数据新鲜度

首页的“全部”视图默认隐藏分类为“其他”的线索，因为综合订阅源可能包含闲聊、求购、抽奖、推广和新闻。点击“查看全部线索”可以显示它们；显式选择“其他”或“我的收藏”时不会隐藏。这个行为只影响页面展示，不会删除数据库记录，也不会改变抓取源和分类规则。

收藏与已领状态只保存在当前浏览器的 `localStorage`：

- `daily-deals-personal-v1`：`{ "claimed": string[], "favorites": string[] }`
- `daily-deals-show-all-v1`：是否显示“其他”线索

这些状态不会上传到服务端，也不会写入 SQLite。清除浏览器站点数据会清除它们。

## 数据来源与处理方式

当前使用七个固定来源。来源地址写在 [`src/lib/source-defs.ts`](src/lib/source-defs.ts) 中，应用调用方不能替换。

| 来源 | 格式 | 主要规则 |
| --- | --- | --- |
| LINUX DO 福利羊毛 | 经 Jina 转换的 Markdown | 解析福利区主题标题、主题链接和 RFC822 日期 |
| V2EX 推广 | Atom | 使用 `promotions.xml`，去掉链接中的 `#reply0` |
| Epic | JSON | 只收录当前时间处于促销窗口内、折扣价为 0 的促销 |
| NodeSeek | RSS / Atom | 收录允许域名内的 feed 条目 |
| 小众软件 | RSS / Atom | 收录允许域名内的 feed 条目 |
| 果核剥壳 | RSS / Atom | 收录允许域名内的 feed 条目 |
| 异次元软件世界 | RSS / Atom | 请求会跟随重定向到最终地址 |

综合 RSS / Atom 来源使用 7 天留存窗口，并限制条目链接必须位于该来源允许的域名内。来源失败会与其他来源隔离，不会因为某一个来源超时而清空其他来源的数据。每个来源的请求超时为 25 秒，单个 feed 最多解析 2000 条，响应累计超过 150 万字符会停止读取。

链接会在入库前校验并规范化：只接受 `http` 和 `https`，拒绝过长链接、带 `user:pass@` 凭证的链接和跨来源域名链接。标题最多保存 300 个字符，摘要最多保存 160 个字符；来源没有提供简介时保持为空，不自行补写价格、日期或领取条件。

Epic 条目的 `expiresAt` 来自当前免费促销的结束时间。其他来源没有真实活动截止时间，页面中的“近 7 天”是数据库留存规则，不是活动到期日。

分类是标题关键词分类，不是人工审核：

- Epic，或包含游戏、Steam 等词：游戏
- 会员、订阅、Pro：会员订阅
- 限免、免费领取：限免
- 白嫖、免费、永免：免费白嫖
- 折扣、优惠码、大促、降价、打折、爆降：低价优惠
- 其他情况：其他

因此，标题中出现“免费”的抽奖、闲聊或条件不明内容仍可能被分到“免费白嫖”。分类结果不能当成领取资格或优惠真实性证明。来源边界、时间规则和每轮验收清单见 [docs/DATA_QUALITY.md](docs/DATA_QUALITY.md)，来源使用条件见 [docs/SOURCES.md](docs/SOURCES.md)。

## 刷新和新鲜度

服务启动约 4 秒后执行一轮抓取，之后每 2 小时执行一轮。调度器在 Node 进程内运行，不依赖浏览器计时器或系统 cron。

- 停止进程、关闭 Docker 或让电脑休眠时，抓取会停止
- 恢复运行后不会补抓停机期间错过的每一轮，只会继续执行下一轮
- 手动刷新和定时刷新共用进程内锁，同一时间只允许一轮运行
- 手动刷新有 60 秒冷却，并限制同一 IP 在 10 分钟内最多触发 8 次
- 最近一轮超过 2.5 小时会标记为过时，超过 4 小时会标记为严重过时
- 程序不会发送邮件、聊天消息或系统通知

`/api/health` 的 `ok: true` 只表示进程能够读取 SQLite，不表示数据新鲜，更不表示每条线索都有效。判断数据状态时，应同时查看 `sourceHealth`、`failures`、`fetchedAt`、`freshness` 和 `anomalies`。

## API

三个接口都使用 `cache-control: no-store`。

### `GET /api/health`

读取服务和最近一轮抓取状态。数据库不可读时返回 HTTP 503。

```bash
curl -sS http://127.0.0.1:38471/api/health
```

重点字段：

- `ok`：进程是否能读取数据库
- `sourceHealth`：最近一轮成功的来源数和来源总数
- `failures`：最近一轮失败的来源及错误信息
- `fetchedAt`：最近一轮结束时间
- `freshness`：是否过时或严重过时
- `anomalies`：全失败、来源返回 0 条、条数骤降等提示

### `GET /api/deals`

返回网页看板所需的完整 `BoardState`，包括当前条目、来源状态、刷新状态、最近一轮结果和新鲜度信息。

```bash
curl -sS http://127.0.0.1:38471/api/deals
```

### `POST /api/refresh`

触发一次手动抓取。请求不需要 body。

```bash
curl -sS -X POST http://127.0.0.1:38471/api/refresh
```

常见响应：

| 状态码 | 含义 |
| --- | --- |
| `200` | 抓取完成并返回最新看板数据 |
| `400` | 请求体超过允许大小 |
| `403` | 跨站刷新请求被拒绝 |
| `409` | 已有一轮刷新正在运行 |
| `429` | 仍在冷却期或触发频率限制 |
| `500` | 未分类的刷新错误 |

这个接口没有登录、token 或 API key 认证。当前同源检查和限流只适合本机使用，不能直接把端口暴露到公网。公网部署前必须补充反向代理、TLS、身份认证、刷新接口访问控制和全局速率限制，相关边界见 [SECURITY.md](SECURITY.md)。

## 项目结构

```text
src/
├── app/
│   ├── api/deals/       # 当前条目与看板数据
│   ├── api/health/      # 健康和新鲜度状态
│   ├── api/refresh/     # 手动刷新
│   ├── demo/            # 仅开发环境的设计预览
│   └── page.tsx         # 正式首页
├── components/
│   ├── deal-board.tsx   # 搜索、筛选、排序、刷新和本地状态
│   └── deal-board.css   # 正式页与 demo 共用样式
├── lib/
│   ├── parse/           # 各来源解析器
│   ├── db.ts            # SQLite 读写
│   ├── refresh.ts       # 抓取编排、锁和失败隔离
│   ├── scheduler.ts     # 启动首轮和定时刷新
│   ├── classify.ts      # 标题关键词分类
│   ├── filter-deals.ts  # 页面筛选和排序
│   ├── board-view.ts    # 客户端响应校验
│   ├── source-defs.ts   # 固定来源和允许域名
│   └── types.ts         # 看板和来源数据类型
tests/                   # 离线测试和脱敏夹具
docs/                    # 开发、运维、数据质量和来源说明
scripts/                 # 手动抓取报告等维护脚本
data/                    # 本机 SQLite 数据，不提交到 Git
```

## 开发与验证

安装依赖后，按下面顺序执行：

```bash
npm ci
npm test
npm run lint
npx --no-install tsc --noEmit
npm run build
git diff --check
```

测试使用 `tests/fixtures/` 和合成样本，不访问外网，也不写入生产目录 `./data`。`npm run report` 会访问真实来源并写入 `DATA_DIR` 指向的数据库，只应在明确需要实时抓取时使用；不要把它指向正在使用的生产库。

GitHub Actions 的常规 CI 会运行离线测试、Lint、生产构建和生产依赖审计。实时来源探测是单独的定时工作流，不作为 Pull Request 的必过检查，因为上游故障、反爬挑战或 feed 结构变化不应阻断无关代码的合并。

动到页面时，还需要在 1440、1280 和 390 像素宽度下检查真实页面，确认没有控制台错误、失败请求、横向溢出、文本裁切或关键控件重叠。完整开发约定见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)，贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 运维和安全

常用 Docker 命令：

```bash
docker compose -p daily-free-info ps
docker compose -p daily-free-info logs -f --tail=200
docker compose -p daily-free-info restart
docker compose -p daily-free-info stop
docker compose -p daily-free-info start
```

SQLite 位于 `./data/deals.db`，WAL 模式下还可能存在 `deals.db-wal` 和 `deals.db-shm`。不要删除 `./data`，也不要只复制 `deals.db` 文件来做正在运行中的数据库备份；一致性备份和恢复步骤见 [docs/OPERATIONS.md](docs/OPERATIONS.md)。

生产容器以非 root 的 `node` 用户运行，宿主的 `./data` 必须对容器内 uid 1000 可写。不要用 `chmod 777` 解决权限问题。

日志统一使用 `[deals]` 前缀的单行 JSON，记录轮次、来源成功与失败、耗时和失败分类，不记录标题正文、Cookie、请求头或浏览器个人状态。结构化日志字段见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

发现内容错误、失效条目或来源问题时，请附原文链接、发现时间和期望行为，通过仓库的 Issue 模板反馈。漏洞不要公开发布可复现细节，按 [SECURITY.md](SECURITY.md) 的私密报告流程提交。

## 文档索引

- [docs/DATA_QUALITY.md](docs/DATA_QUALITY.md)：来源、解析、分类、留存、时效和每轮验收规则
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)：架构、目录、命令、API 字段、日志和视觉验收
- [docs/OPERATIONS.md](docs/OPERATIONS.md)：Docker 启停、排障、备份、恢复和回滚
- [docs/SOURCES.md](docs/SOURCES.md)：来源清单、字段边界、使用条件和移除渠道
- [CONTRIBUTING.md](CONTRIBUTING.md)：本地准备、测试约定和新增来源要求
- [SECURITY.md](SECURITY.md)：漏洞报告和公网部署边界
- [CHANGELOG.md](CHANGELOG.md)：版本变更记录
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)：第三方依赖许可说明
- [AGENTS.md](AGENTS.md)：本仓库维护规则

## 许可证

本项目采用 [MIT License](LICENSE)。你可以自由使用、修改和商用，但需要保留版权与许可证声明。第三方依赖的许可义务见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。来源站点的内容和使用条件不由本仓库的 MIT 许可证覆盖。
