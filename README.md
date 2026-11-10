# PerkRadar

PerkRadar 是一个可自行部署的优惠线索聚合器。它定时读取固定的公开 RSS、Atom、JSON 和 Markdown 来源，把标题、原文链接和短摘要整理到一个轻量的 SQLite 数据库，再用网页看板帮助你搜索、筛选、收藏和标记已领。

项目名称与 GitHub 仓库名统一为 **PerkRadar**，克隆后的目录名为 `PerkRadar`；npm 包名、Docker Compose 项目名和容器名使用小写 `perkradar`。

它的定位是“先把线索集中起来”，不是逐条认证的领取平台。页面里的一条记录只代表对应来源曾返回过这条内容，不代表活动仍然有效、领取条件已经核实、账户一定有额度，也不代表 PerkRadar 已经打开原文逐条确认。使用时请把原文页面作为最终依据。

## 推荐安装方式：交给 Personal Agent 部署

Personal Agent 可以协助部署和安排外部推送，但**不得把 PerkRadar 端口直接暴露到公网，也不得仅把 HOST 改为 0.0.0.0 就当作完成部署**。本项目本身不发送通知。

云部署必须使用 TLS 反向代理，并设置至少 32 字符的随机 `PERKRADAR_ACCESS_TOKEN`。不要把真实令牌写进仓库、URL 或公开聊天。网页在 `/login` 输入令牌后获得 HttpOnly、SameSite=Strict、8 小时有效的签名会话；Agent 使用 `Authorization: Bearer <token>`。配置令牌后首页及所有数据/刷新 API 均要求认证；未配置时仅适用于可信的本机单用户环境。

宿主机运行 Caddy 的最小模板（将域名替换为你控制的域名；公网仅开放 80/443，应用仍绑定 127.0.0.1）：

```caddyfile
perks.example.com {
    reverse_proxy 127.0.0.1:38471
}
```

域名解析和公网端口配置正确后，Caddy 负责申请证书和终止 TLS；PerkRadar 使用共享访问令牌和签名会话控制访问，没有独立的多用户账号系统。生产会话默认带 `Secure`，公网部署必须保持开启。仅在可信的本机 HTTP 调试环境中，可设置 `PERKRADAR_SECURE_COOKIE=0`；这不会影响 Bearer 认证。

登录尝试按进程共享限额，每分钟最多 10 次；页面中的“退出”清除本浏览器的 cookie。会话过期或令牌更换后需要重新登录；要让全部旧会话失效，应更换 `PERKRADAR_ACCESS_TOKEN` 并重启应用。也可在代理前增加 SSO，但仍须保留应用访问控制。保持 `TRUST_PROXY_HEADERS` 关闭，除非代理明确覆盖转发头。完整环境变量与升级注意事项见 [运维文档](docs/OPERATIONS.md)。

## 快速开始

### 环境要求

- Node.js 22.13 或更高版本
- npm
- 如果使用 Docker，需要 Docker Desktop 或兼容 Docker Compose 的环境（Compose v2.24 或更高版本）

Node.js 22.13 是最低要求，因为项目使用了 Node 内置的 `node:sqlite`。依赖版本锁在 `package-lock.json` 中。

### 获取源码

```bash
git clone https://github.com/luobinger/PerkRadar.git
cd PerkRadar
```

上述命令获取仓库的默认分支；如果正在阅读其他分支上的 README，应切换到对应分支后再按本文操作。已有旧版本的部署者应先阅读[升级注意事项](#运行状态与升级)，备份数据库并停止旧实例，再启动新版。

### 用 Docker 运行

这是推荐的本机运行方式。它会构建生产镜像、启动容器，并把 SQLite 数据保存在项目目录的 `./data` 中。根目录 `.env` 是可选配置文件，不提交到 Git，也不复制进镜像；含凭据时应限制为仅本人可读（权限 `600`）。

`PERKRADAR_ACCESS_TOKEN` 控制本应用的访问认证。`JINA_API_KEY` 只用于 LINUX DO 来源所依赖的 Jina 服务，两者用途不同。也可通过 `JINA_API_KEY_FILE` 读取 Jina key，文件路径必须在容器内可访问，并由运行环境单独挂载；仅把文件放在宿主的 `.secrets/` 下不会自动挂载。未配置 Jina key 时使用匿名请求，可能受上游免费额度和限流影响，页面会显示诊断信息。

```bash
docker compose -p perkradar up -d --build
```

打开 [http://127.0.0.1:38471/](http://127.0.0.1:38471/)，或先检查服务健康状态：

```bash
curl -sS http://127.0.0.1:38471/api/health
```

默认只绑定到本机回环地址 `127.0.0.1`，不会自动提供公网访问。宿主端口被占用时，只替换宿主端口，容器内端口仍保持 `38471`：

```bash
HOST_PORT=38481 docker compose -p perkradar up -d --build
```

此时访问 [http://127.0.0.1:38481/](http://127.0.0.1:38481/)。完整的启停、日志、备份、恢复和回滚说明见 [docs/OPERATIONS.md](docs/OPERATIONS.md)。

### 用 npm 开发

```bash
npm ci
npm run dev
```

开发服务器默认监听 `127.0.0.1:38471`（`HOST`/`PORT` 可显式覆盖；公网部署须按上方安全指引），打开 [http://127.0.0.1:38471/](http://127.0.0.1:38471/)。开发模式默认使用项目目录下的 `data/deals.db`，首次运行会从真实来源抓取，不会灌入示例优惠。

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

首页默认显示全部分类。可取消“查看全部线索”来隐藏“其他”；搜索、显式选择“其他”或“我的收藏”时不隐藏。重置恢复显示全部；迁移用户保留已保存的展示偏好。每次渲染 100 条，可继续加载，提示当前范围。

收藏与已领状态只保存在当前浏览器的 `localStorage`：

- `perkradar-personal-v1`：`{ "claimed": string[], "favorites": string[] }`
- `perkradar-show-all-v1`：是否显示“其他”线索

新键不存在时会读取旧 `daily-deals-*` 键，并尝试迁移到新键；旧键保留，不会被删除。后续操作只写入新键，回退旧版前端时不会自动同步迁移后的新增收藏和已领状态。收藏或已领状态保存失败时，页面明确提示，本次操作只保留在当前页；展示偏好或自动迁移写入失败时，也不保证刷新后保留。

这些状态不会上传到服务端，也不会写入 SQLite，并且按浏览器站点隔离。更换协议、域名或端口后不会自动迁移；清除浏览器站点数据会清除它们。

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

综合 RSS / Atom 来源使用 7 天留存窗口，并限制条目链接必须位于该来源允许的域名内。来源失败会与其他来源隔离，不会因为某一个来源超时而清空其他来源的数据。每个来源的网络抓取与重试共用 25 秒超时窗口，单个 feed 最多解析 2000 条，响应按字符累计限制为 150 万字符；已声明的 Content-Length 超过同一数值也会提前拒绝。

来源返回 `429` 或 `503` 时最多额外重试两次，等待时间从 500 毫秒起翻倍，并取上游 `Retry-After` 与该等待时间的较大值。单次等待超过 5 秒时，本轮不继续等待，推迟到后续轮次；采信的 `Retry-After` 最多为 6 小时。同一来源连续三次抓取失败后至少暂停 10 分钟，到期后的下一次抓取再尝试；这些退避状态保存在进程内，重启后重置。

链接会在入库前校验并规范化：只接受 `http` 和 `https`，拒绝过长链接、带 `user:pass@` 凭证的链接和跨来源域名链接。标题最多保存 300 个字符，摘要最多保存 160 个字符；来源没有提供简介时保持为空，不自行补写价格、日期或领取条件。

Epic 条目的 `expiresAt` 来自当前免费促销的结束时间。其他来源没有真实活动截止时间，页面中的“近 7 天”是数据库留存规则，不是活动到期日。

分类是可解释的信号评分，不是人工认证：明确限免、免费领取、降价、优惠券、折扣、返现、红包、注册送额度等信号加分，抽奖、求购、二手买卖帖、提问句和编辑性讨论扣分；`Pro` 单独不再表示会员，更新/公告/问号不会单独否决明确优惠。`classifySignals()` 返回类别、内容类型、分数及置信度。默认在读取时重算分类，不改写历史库；设置 `PERKRADAR_STORED_CATEGORIES=1` 可回退到已存分类。来源边界见 [docs/SOURCES.md](docs/SOURCES.md)。

## 刷新和新鲜度

调度器运行在常驻 Node 进程内，正常抓取间隔为 2 小时。首次启动或上次轮次已超期时，约 4 秒后抓取一次当前数据；未超期则等待剩余间隔。每 20 秒检查到期时间并续租，机器休眠跨过到期时间后，在恢复运行的下一个检查点补抓一轮。不会重放所有错过的轮次，也不能恢复上游已经滚出的内容。

SQLite 调度租约有效期为 90 秒。租约被其他进程持有时，本进程仍可提供页面，只暂停定时抓取并继续尝试获取租约；前一个进程被强杀后，需等待剩余租约过期再接管。这是单机单实例部署的保护措施，不支持跨主机共享 SQLite 或多副本部署。

- 停止进程、关闭 Docker 或让电脑休眠时，抓取会停止
- 全部来源失败或调度任务抛错时，安排提前重试：初始等待 10 分钟，连续失败时翻倍，上限为正常的 2 小时间隔；已有刷新在运行时约 60 秒后再试
- 手动刷新和定时刷新共用进程内锁及 SQLite 轮次租约，失效持有者不能提交结果
- 手动刷新有 60 秒冷却；默认所有请求共享每 10 分钟 8 次的尝试限额。仅当 `TRUST_PROXY_HEADERS=1` 且代理可信时，才按转发 IP 分别计数。限流状态在进程重启后重置
- 最近一轮超过 2.5 小时会标记为过时，超过 4 小时会标记为严重过时
- 程序不会发送邮件、聊天消息或系统通知

`/api/health` 的 `ok: true` 只表示进程能够读取 SQLite，不表示数据新鲜，更不表示每条线索都有效。判断数据状态时，应同时查看 `sourceHealth`、`failures`、`fetchedAt`、`freshness` 和 `anomalies`。

## API

数据成功响应和认证接口使用 `cache-control: no-store`；数据库读取失败也明确禁止缓存。

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
- `anomalies`：全失败、来源返回 0 条、条数骤降、连续失败达到 3 轮、解析结构异常等提示
- `sources[].quality`：每个来源近 8 条已结束轮次的连续失败数、条数骤降、解析结构异常和简短 warning；历史查询有上限，不新增数据库表

### `GET /api/deals`

返回 `BoardState` 和 `pagination: {offset, limit, total, hasMore}`。支持 `?offset=0&limit=500`；`offset` 必须是非负整数，`limit` 必须为 1–2000 的整数，默认 500。无效分页参数返回 `400`，数据库不可读返回 `503`；全局统计不随分页缩水。网页按页读取完整列表（安全上限 10 万条）并每 30 秒在可见时读取数据库中的最新结果，重新聚焦立即检查；请求超时会取消。这种轮询不触发外部来源抓取，抓取由调度器或“立即刷新”触发。

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
| `200` | 本轮已处理并返回看板数据；应继续检查 `roundStatus` 和 `sourceHealth`，来源可以部分或全部失败 |
| `400` | `Content-Length` 声明的请求体大小超过 2048 字节 |
| `401` | 开启访问认证后，缺少有效 Bearer 令牌或会话 |
| `403` | 跨站刷新请求被拒绝 |
| `409` | 已有一轮刷新正在运行 |
| `429` | 仍在冷却期或触发频率限制 |
| `500` | 未分类的刷新错误 |
| `503` | 访问认证配置无效，例如令牌短于 32 字符 |

设置 `PERKRADAR_ACCESS_TOKEN` 后，本接口与其余数据 API 要求 Bearer 或会话认证；未配置或设为空字符串时没有身份认证，非空但不足 32 字符会拒绝访问。API 示例中的裸请求适用于未开启认证的本机环境；开启认证后，客户端需从安全配置读取令牌并放入 `Authorization: Bearer …` 请求头，或携带网页登录获得的会话 cookie。仍保留同源防护、冷却与限流，不能直接暴露端口，详见 [SECURITY.md](SECURITY.md)。

### `/api/session`

- `POST`：提交 URL 编码表单，字段名为 `token`。校验成功后设置 8 小时会话并以 `303` 跳转首页；浏览器表单失败时跳回登录页显示原因，脚本请求返回相应 JSON 错误状态。
- `DELETE`：清除本浏览器的会话 cookie，成功返回 `204`。此操作不撤销其他浏览器已持有的签名会话。

登录和退出均检查浏览器请求来源；登录表单实际读取上限为 4096 字节。

## 项目结构

```text
src/
├── app/
│   ├── api/deals/       # 当前条目与看板数据
│   ├── api/health/      # 健康和新鲜度状态
│   ├── api/refresh/     # 手动刷新
│   ├── api/session/     # 登录与退出
│   ├── login/           # 访问令牌登录页
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
│   ├── classify.ts      # 标题信号评分与分类
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

GitHub Actions 的常规 CI 在推送 `main`、提交 Pull Request 或手动触发时运行，使用 Node.js `22.13.0` 和 `24` 两个版本，检查离线测试、Lint、类型、生产构建和生产依赖审计。仅推送其他分支不会自动触发这套 CI。依赖审计使用 npm 官方 registry，避免镜像缺少审计端点导致误报。实时来源探测是单独的定时工作流，不作为 Pull Request 的必过检查，因为上游故障、反爬挑战或 feed 结构变化不应阻断无关代码的合并。

动到页面时，还需要在 1440、1280 和 390 像素宽度下检查真实页面，确认没有控制台错误、失败请求、横向溢出、文本裁切或关键控件重叠。完整开发约定见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)，贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 运维和安全

常用 Docker 命令：

```bash
docker compose -p perkradar ps
docker compose -p perkradar logs -f --tail=200
docker compose -p perkradar restart
docker compose -p perkradar stop
docker compose -p perkradar start
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

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=luobinger/PerkRadar&type=Date)](https://star-history.com/#luobinger/PerkRadar&Date)

## 运行状态与升级

数据库使用 `PRAGMA user_version` 管理版本。首次从旧库升级到版本 1 时，在事务中增加索引和租约表，不重写已有优惠条目；程序拒绝打开版本高于 1 的数据库。每轮刷新提交时清理 30 天前已结束的抓取轮次及对应来源记录，始终保留最近一个已结束轮次；这项历史清理不删除 `deals`，条目另按来源留存与到期规则处理。

**升级前先做一致性备份并保留旧镜像。** 旧部署使用的 Compose 项目名是 `daily-free-info`，当前使用 `perkradar`；改名会创建另一套容器与网络，不能在旧实例仍运行时直接启动新版并共用 `./data`。按[运维文档](docs/OPERATIONS.md)停旧实例、迁移、验收；需要回滚时使用升级前的备份和镜像。源码更新或推送 GitHub 不会自动更新已运行的容器。
