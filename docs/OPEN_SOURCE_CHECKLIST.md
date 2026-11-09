# PerkRadar 开源状态清单

> 本文只记录**当前状态**与仍需遵守的判据，不是施工顺序或交付记录。口径：**上传 GitHub 只代表源码公开，不代表网站已公网部署。**
> 记录日期：2026-11-09（北京时间）。品牌对外统一为 `PerkRadar`，版本遵循语义化版本。

## 1. 发布与仓库状态

| 项 | 当前状态 |
| --- | --- |
| 公开版本 | `v0.1.0` 的 tag 与 GitHub Release 已于 2026-11-08 17:17（北京时间）发布 |
| 分支 | 仓库在本目录独立初始化，`main` 跟踪 `origin/main` |
| 未发版改动 | `main` 上的当前源码对应 `[Unreleased]`，**尚未打新 tag、尚未发版**；变更条目见 [CHANGELOG.md](../CHANGELOG.md) |
| 部署 | 不提供公网服务，默认只监听 `127.0.0.1:38471` |

`package.json` 为 `perkradar@0.1.0`、`license: MIT`。仓库发布状态与工作区改动要分开看：`[Unreleased]` 描述当前源码，不是已发布版本的行为。

## 2. 品牌与运行标识

对外文字用 `PerkRadar`；下列运行标识保持不变，避免改名导致本机状态丢失：

- Compose 项目名 `daily-free-info`、容器名、镜像 tag `daily-free-info:local`、命令里的 `-p daily-free-info`；
- 卷 `./data`、`deals.db` 及 WAL/SHM 文件、SQLite 表名与列名、`SOURCE_DEFS` 的 id、端口 38471；
- 浏览器 `localStorage` 键 `daily-deals-personal-v1` 与 `{ claimed, favorites }` JSON 形状。

判据：改 Compose 项目名会新建一套容器与网络，改收藏键或表结构会让用户本机收藏、已领与现有库不兼容。品牌改名不构成迁移这些状态的理由。

## 3. 许可与第三方声明

当前齐全：`LICENSE`（MIT）全文、`package.json` 的 `license` 字段、README 许可段落、[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)（生产依赖逐项列名称、版本、许可证、上游地址；开发依赖单列「仅构建期，不随镜像分发」）。`node:sqlite` 是 Node 内置模块，不单独引入第三方许可。

判据：README、`package.json`、`LICENSE` 三处口径一致；`THIRD_PARTY_NOTICES.md` 与 `package-lock.json` 的生产依赖对得上。内容来自第三方站点，其使用条件不受本仓库代码许可覆盖。

## 4. 仓库清洁与忽略规则

`.gitignore` 排除 `/data/`、`*.db*`、`.env*`、`.next/`、`*.tar.gz`、`/deployment-backups/`、`/reports/`、`/snapshots/`、`*.bak`、日志、快照产物与 `/.workbuddy/`。`.dockerignore` 排除 `deployment-backups/`、`*.tar.gz`、`docs/`、根目录 `*.md`、`scripts/`、`AGENTS.md`、`tests/`、`snapshots/` 等；镜像只带构建必需项（`src/`、`public/`、`package*.json`、`next.config.mjs`、`tsconfig.json`、`postcss.config.mjs`、`eslint.config.mjs`、`components.json`），并以 `node`（uid 1000）非 root 运行。

`tsconfig.json` 与 `eslint.config.mjs` 都排除 `deployment-backups/`：那里有旧的 `next.config.ts`，会被 `include: **/*.ts` 扫到。部署包应保持为 tar，不展开到项目树里。

根目录的 4 个 `tar.gz` 与 `deployment-backups/` 目前仍在工作区，已被 `.gitignore` / `.dockerignore` 排除、git 未跟踪。**是否移走归档由维护者决定**；本文不替维护者做这个决定，也不把它记为已完成或待办。

判据：`git ls-files` 不含数据库与 WAL/SHM、`*.tar.gz`、`deployment-backups/`、`reports/`、`*.bak`、快照产物；`COPY . .` 后的镜像里没有 tar 包与备份目录；全新克隆里没有 `./data`。凭证扫描（`token` / `key` / `password` / `Bearer` / 绝对路径 / `.env*`）是每次提交前的固定检查项。

## 5. 对外说明与文档

README 首屏明确：定位是「多来源优惠线索聚合」，不是逐条认证的领取平台；条目只代表 feed 里有这条，不代表活动仍有效、条件已核实或账户里真有额度。并写明 7 个来源及其形态、关键词分类会误判、闲聊 / 求购 / 抽奖 / 推广照常收录但「其他」在正式页默认隐藏、除 Epic 的当前免费促销外 `expires_at` 为空、进程内 2 小时调度会漏轮、`ok: true` 只证明能读库、默认 loopback、上传 GitHub ≠ 已部署。

界面文案：顶部只有品牌和「立即刷新」；搜索、排序、来源、分类、收藏、运行状态与逐源结果在左侧状态区和提示区；「信息列表」标题行右侧是「查看全部线索」与「只看新增」两个开关，并显示可见条数与「已隐藏 N 条「其他」线索」；卡片只保留标题、收藏文字按钮、摘要框、原文信息、标签、「打开原文」与「标记已领」。浅色底、`RGB(20,148,130)` 小面积强调，未实现深色模式，系统字体、不加载外部字体或 CDN；正式页与本地 dev 预览 `/demo` 共用 `src/components/deal-board.css`，`/demo` 是 7 条示例的设计预览（1 条「其他」默认隐藏，「只看新增」仍为 3 条），生产镜像的构建结果只有 `/`、`/_not-found` 和三个 API，不含 `/demo`。页面持续可见地说明条目来自公开订阅源、只是线索、未核实有效性 / 条件 / 能否领取。客户端 `src/lib/board-view.ts` 校验接口响应与 SSR 快照；本地状态写入失败、轮询失败、空库、筛选为空，以及刷新 429 / 断网 / 畸形响应各有区分提示。

正式页「全部」视图默认隐藏分类为「其他」的条目：显式选「其他」分类或「我的收藏」时不隐藏，搜索仍受默认隐藏影响（结果为空会提示打开开关），重置回默认隐藏。「查看全部线索」用独立 `localStorage` 键 `daily-deals-show-all-v1` 记住选择、监听 `storage` 事件跨标签同步、刷新后保留；`daily-deals-personal-v1` 与 `{ claimed, favorites }` 形状不变。本地 dev 预览 `/demo` 的同类开关只在当前页面内存生效、刷新重置。隐藏只作用于展示，不改收录规则、分类规则或数据库。

界面重构的测试报告见 [docs/PERKRADAR_UI_REFACTOR_TEST_REPORT.doc.md](PERKRADAR_UI_REFACTOR_TEST_REPORT.doc.md)（配套 .docx 由 IDE 生成），验收日志见 [reports/ui-refactor-2026-11-09.log](../reports/ui-refactor-2026-11-09.log)、[reports/browser-adversarial-2026-11-09.log](../reports/browser-adversarial-2026-11-09.log) 与 [reports/default-hide-other-2026-11-09.log](../reports/default-hide-other-2026-11-09.log)；`npm test`、`npm run lint`、`npx --no-install tsc --noEmit`、`git diff --check` 通过，1280 桌面 / 390 手机预览无控制台报错、无失败请求、无关键视觉缺陷（左栏文字重叠已修），390px 无横向溢出；默认隐藏、查看全部线索开关、只看新增组合、显式选「其他」/「我的收藏」、重置、刷新后开关保留等主流程均通过。测试项数以 `npm test` 输出为准。

维护入口齐全且互相引用一致：[README.md](../README.md)、[DEVELOPMENT.md](DEVELOPMENT.md)、[OPERATIONS.md](OPERATIONS.md)、[DATA_QUALITY.md](DATA_QUALITY.md)、[SOURCES.md](SOURCES.md)、[CONTRIBUTING.md](../CONTRIBUTING.md)、[SECURITY.md](../SECURITY.md)、[CHANGELOG.md](../CHANGELOG.md)、问题模板与 [AGENTS.md](../AGENTS.md)。

判据：对外文档里没有本机运行数字、本机绝对路径、某次会话的施工记录或「已上线」表述；错报 / 失效 / 来源失效 / 新来源申请都有可直接使用的提交路径。

## 6. 持续集成与依赖审计

- `.github/workflows/ci.yml`：固定 Node 22 → `npm ci` → `npm test` → `npm run lint` → `npm run build` → `npm audit --omit=dev --registry=https://registry.npmjs.org`。
- `.github/workflows/live-sources.yml`：`workflow_dispatch` + `schedule`（cron 用 UTC，`23 4 * * *` 即北京时间 12:23），单独运行、写临时 `DATA_DIR`、设 `DISABLE_SCHEDULER=1`，不进入 PR 必过项。
- 两个 workflow 都声明 `permissions: contents: read`。
- `package.json` 声明 `engines.node >=22`，`.nvmrc` 为 22。Next 仍锁 15.5.29、ESLint 仍 9，没有升级大版本。

依赖审计：生产依赖 `npm audit --omit=dev` 为 0 项；完整 `npm audit` 的告警全部在开发依赖里。CI 已显式指定官方 registry；本机默认 npm 镜像不支持 audit 端点，本地复查要手动加 `--registry=https://registry.npmjs.org`。测试项数以 `npm test` 输出为准，不写进文档。

判据：锁文件变更后必须重跑审计，不沿用任何一次历史结果；断网或上游 500 时 PR 检查靠固定样本仍全绿；实时源检查失败不阻塞合并；CI 日志能区分「测试失败」与「上游不可达」。

## 7. 数据质量与来源合规

7 个固定来源，URL 写死在 `src/lib/source-defs.ts`，调用方不能替换；LINUX DO 走现有 Jina 地址，V2EX 用复数 `promotions.xml`。每源有一份允许域名（含子域），条目链接不在本源域名内会被丢弃并记 `offsite_link_dropped`。收录语义是「线索聚合、非优惠清单」：综合源按 7 天窗口收录，闲聊、求购、抽奖、推广会进入列表，分类误判是已知行为。反例测试覆盖闲聊、求购、抽奖、过期、未来促销、长期免费本体、限时礼包与空结果，并允许结果为空、不拿普通帖子补数量。

分类里的「其他」只表示标题没命中优惠关键词，是线索聚合下的兜底标签，**不是优惠判定，也不代表已排除优惠**：与羊毛优惠无关的闲聊帖同样会归到这里。正式页「全部」视图已默认隐藏「其他」，并保留「查看全部线索」开关，见 [§5 界面文案](#5-对外说明与文档)、[DATA_QUALITY.md](DATA_QUALITY.md) 与 [README.md](../README.md)；隐藏只改展示，收录规则、分类规则与数据库都不变。是否在入库时收紧关键词、从源头少收这类闲聊帖，是**尚未实施的后续选项**：它会改变 7 天窗口下的收录语义与在架条数，需同步改 `src/lib/classify.ts`、对应测试与 [SOURCES.md](SOURCES.md) 的收录说明；当前收录规则保持不变。

[SOURCES.md](SOURCES.md) 记录各源使用条件核查结论与核查日期（**未完成逐站书面核查**），不把「公开可访问」等同于可任意再分发；单独标注 LINUX DO 经第三方代理、Epic 使用静态后端端点两处风险，并提供移除与纠错渠道。新增来源必须按 [CONTRIBUTING.md](../CONTRIBUTING.md) 提供证据清单。

判据：`src/lib/source-defs.ts` 与各文档逐项一致；仓库与测试夹具内不存第三方正文全文；每源有「使用条件核查结论 + 核查日期」。

## 8. 可观测性

`freshness` / `anomalies` 已在 `/api/health` 与页面实现：最近一轮结束超过 2.5 小时为 stale、超过 4 小时为 severe，并提示上一轮全失败、某源成功但 0 条、某源解析条数骤降。**但程序不会主动发送邮件或聊天通知**，提示只出现在 API 与页面上。

结构化日志统一前缀 `[deals] {"event":...,"at":ISO,...}`，成功走 stdout、失败走 stderr，不含标题正文、Cookie、请求头或个人状态；`source_round.reason` 把失败归到 `timeout` / `http_status` / `response_too_large` / `malformed_response` / `unknown`。事件与字段清单见 [DEVELOPMENT.md](DEVELOPMENT.md)「结构化日志」，用 `docker compose logs` 查看。

判据：日志能回答「哪一轮、哪个源、耗时多少、为什么失败」；每轮验收清单见 [DATA_QUALITY.md](DATA_QUALITY.md)。

## 9. 默认安全与部署边界

- 端口绑定只有 `127.0.0.1:${HOST_PORT:-38471}:38471`，不改 `0.0.0.0`。容器非 root，`./data` 须对 uid 1000 可写，不用 `chmod 777` 绕过。
- `POST /api/refresh` **没有身份校验**，只依赖同源校验（`sec-fetch-site: cross-site` 拒绝 403、`Origin` 与 `Host` 不一致拒绝 403；不带 `Origin` 的请求放行）、60 秒冷却、每 IP 10 分钟 8 次内存限流（重启清零）、`Content-Length` 上限、单源 25 秒超时与响应体大小上限。
- 客户端 IP 默认忽略 `x-forwarded-for` / `x-real-ip`（一律归 `local`），只有 `TRUST_PROXY_HEADERS=1` 时才信任转发头；只在确有可信反向代理时开启。三个接口都带 `cache-control: no-store`。

判据：把现有端口直接暴露到公网等于开放一个可随意触发外链抓取的接口；如需公网访问，须另行设计认证、TLS、刷新接口鉴权与全局速率限制。详见 [SECURITY.md](../SECURITY.md)。

## 10. 已知限制（仍然存在）

- 不提供公网服务；**上传 GitHub ≠ 已部署**。
- 停机不补轮、单实例进程内锁；休眠、关机、容器停止都会让抓取停下，恢复后只再跑一轮。
- 除 Epic 的当前免费促销外没有真实截止时间；「近 7 天」是留存规则，不是活动截止日。
- 新鲜度与异常只在 API 与页面提示，不主动发送通知。
- 公开快照在本机 Compose 默认关闭；外部推送渠道不属于本仓库，不与本机库同步。
- 收藏与已领只在这台浏览器；关键词分类会误判，线索聚合而非逐条认证。
- 规范化 URL 仍不统一 `www.` 前缀、http/https 与路径大小写，这是已知边界。

## 11. 全局纪律（承接 [AGENTS.md](../AGENTS.md)）

- 不把没抓到的写成抓到，不把测试夹具写进 `./data`，不把闲聊、新闻、抽奖或条件不明的标题说成已核实可领，不把在架条数当成官方确认。
- 不自动注册付费服务、不擅自更换抓取源、不直连 `linux.do`、不绕过站点挑战；来源 URL 以 `src/lib/source-defs.ts` 为准。
- 不删除 `./data`，不清理浏览器里的 `daily-deals-personal-v1`。
- 只操作本项目：不对其他目录 `docker compose down`，不 `docker system prune`，不动其他容器、端口与卷。
- 每次改代码都实跑测试、lint、build；动到页面要在 1440 / 1280 / 390 宽度下看真实数据。**没跑过的检查不写成已通过**；生产镜像是否重建，以本机 `docker compose` 结果为准。
- 本机运行数字属瞬态，不写进公开文档或 Release notes。
