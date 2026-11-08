# 变更记录

格式参考 Keep a Changelog，版本遵循语义化版本。日期为北京时间。测试项数以 `npm test` 输出为准，在架条数以 `/api/deals` 为准，不写进文档。

## [Unreleased]

本轮加固已提交到 `main`，**尚未发版**（无新 tag、无新 Release）。以下内容描述当前源码行为。

### 加固与修正

- 解析：Epic 返回 200 但商品列表为空数组时视为上游异常、该源失败（「Epic 商品列表为空」），不删除库里已有的 Epic 行；正常「有商品但没有当前免费促销」仍返回空结果并按既有规则下架。
- 解析：feed 发布时间早于 2000-01-01 或晚于当前时刻 +7 天记为无效（`published_at` 为 `null`），留存改用 `first_seen_at`；单个 feed 最多解析 2000 条。
- 抓取：先用 `Content-Length` 预检，再按块流式读取，累计超过 150 万字符即停止下载并报「响应过大」；HTTP 错误状态在读取响应体之前就返回。单源 25 秒超时不变。
- 清洗：去掉 ANSI/SGR 控制序列（含只剩 `[1m` 这类残留与 `[H[J[3J` 这类裸 CSI 片段）、C0 控制字符，以及 8 个以上连续的 `+ * = _ ~ #` 分隔线；标题 300 字、摘要 160 字上限不变。读库展示时再做一次幂等清洗，早期已入库的历史行同样生效，不改写现有数据库。
- 链接：超过 2048 字符、含 `user:pass@` 凭证或非 http/https 协议的链接直接拒绝。
- 链接边界：七个来源各有一份允许域名，条目链接不在本源域名（含子域）内会被丢弃并记 `offsite_link_dropped`。来源 URL 未改，LINUX DO 仍走现有 Jina 地址。
- 界面：卡片按钮「打开原文」、顶栏「已收录」、持续可见的线索说明；修复 390px 宽度下顶栏裁切与卡片底部控件溢出；本地状态写入失败有可见提示、监听 `storage` 事件跨标签同步、轮询接口失败有可见提示并与空库/筛选为空区分。`daily-deals-personal-v1` 与 `{ claimed, favorites }` 形状不变。
- 接口：`GET /api/deals` 数据库异常时返回 503 `数据库不可读` 并记 `deals_read_failed`；成功响应字段不变。三个接口都带 `cache-control: no-store`。
- 安全：客户端 IP 默认忽略 `x-forwarded-for` / `x-real-ip`（一律归 `local`），仅 `TRUST_PROXY_HEADERS=1` 时信任转发头；带 `sec-fetch-site: cross-site` 的刷新请求拒绝 403；不带 `Origin` 的请求仍放行。
- 日志：统一前缀 `[deals] {"event":...,"at":ISO,...}`，成功事件走 stdout、失败事件走 stderr，不含标题正文、Cookie、请求头或个人状态；事件清单见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。
- 工程：`engines.node >=22` 与 `.nvmrc`（22）；`tsconfig.json` / `eslint.config.mjs` 排除 `deployment-backups/`；`.dockerignore` 额外排除根目录 `*.md` 与 `scripts/`；两个 workflow 增加 `permissions: contents: read`，live-sources 的 cron 注明为 UTC。镜像仍以 `node`（uid 1000）非 root 运行。

### 已知边界

规范化 URL 仍不统一 `www.` 前缀、http/https 与路径大小写，这是已知限制，不是已修复项。

## [v0.1.0] - 2026-11-08

首个公开版本，tag 与 GitHub Release 已发布。定位：**多来源优惠线索聚合**，不是逐条认证的领取平台。上传 GitHub 只代表源码公开，不代表网站已公网部署。

### 能力

- 7 个固定来源并发抓取，单源 25 秒超时与失败隔离；LINUX DO Markdown、RSS/Atom、Epic JSON 三类解析。
- Epic 当前免费促销的半开时间窗与 0 价判定；7 天留存与到期淘汰的毫秒边界；规范化 URL 去重。
- 进程内 2 小时调度、启动首轮、进程内锁；手动刷新的冷却、IP 限流与同源校验。
- 服务端渲染页面与 3 个接口；收藏与已领的浏览器本地持久化。
- 测试、lint、构建与 CI 覆盖；生产依赖审计（显式指定官方 registry）为 0 项。

### 已知限制

- 综合 RSS/Atom 源按 7 天窗口收录，闲聊、求购、抽奖、推广会进入列表；关键词分类会误判。保留「线索聚合」路线，不声称逐条优惠。
- 除 Epic 外没有真实截止时间；「近 7 天」是留存规则，不是活动截止日。
- 进程内定时器在休眠或停机期间不补轮；重启会立刻再抓一轮并改写下次计划。
- 公开快照在本机 Compose 默认关闭；外部推送渠道不属于本仓库。
- 单人单实例、非公网服务；品牌文案与运行标识保持分离（Compose 项目名、容器名、卷与收藏键未改名）。
