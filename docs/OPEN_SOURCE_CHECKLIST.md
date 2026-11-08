# PerkRadar 开源发布清单（交给本地 agent 执行）

> **状态：任务书 + 阶段执行记录。** §0.3 记录已实测通过的部分；各节仍保留待办与验收判据，未标注完成的项目不代表已做完。
> 记录时间：2026-11-08（北京时间）。目标：以 `PerkRadar` 品牌发布 `v0.1.0` 公开仓库。
> 口径：**上传 GitHub 只代表源码公开，不代表网站已公网部署。**

本清单按用户给定的顺序编排。执行时不得跳序：第 1 节全绿、且用户确认仓库初始化与远端之后，才能进入第 2 节；第 3 节是发布口径。

---

## 0. 执行前的事实基线（实测，不是文档转述）

| 项 | 当前状态 |
| --- | --- |
| Git | 本目录没有自己的 `.git`，但落在上级目录的 Git 工作树内（父仓库已忽略本项目，跟踪数 0）。「检查 Git 历史」目前无本项目历史可查；重点是建立独立仓库后**首次提交前**的预防 |
| 本机依赖 | **没有 `node_modules`**，本机直接跑不了 `npm test` / `lint` / `build`；需 Node 22 下先 `npm ci`。历史测试结论不能沿用 |
| 运行态 | 容器 `daily-free-info` healthy，仅 `127.0.0.1:38471`；镜像内 38 个 `src/` 文件与磁盘 md5 全一致 |
| 易误提交物 | `data/deals.db` + `-wal` + `-shm`、根目录 4 个 `*.tar.gz`、`deployment-backups/`（含展开的 `next.config.ts`、旧 README、`old-container-inspect.json`） |
| 个人/内部信息 | `AGENTS.md` 第 3 行含本机绝对路径；`README.md` 第 29–41 行是某次交付记录与聊天 routine 说明；`docs/DEVELOPMENT.md` 含云端会话审计与视觉验收记录；`docs/OPERATIONS.md` 含 `$HOME` 归档路径 |
| 开源基建 | `LICENSE`、`NOTICE` / `THIRD_PARTY_NOTICES.md`、`CONTRIBUTING.md`、`SECURITY.md`、`CHANGELOG.md`、`.github/` **全部缺失** |
| 忽略文件 | `.gitignore` 已忽略 `/data/*.db*`、`.env*`、`.next/` 等，**未**忽略 `*.tar.gz`、`deployment-backups/`、`reports/`、快照产物、`*.bak`、`logs`、`.workbuddy/`；`.dockerignore` **未**排除 `deployment-backups/` 与根目录 `*.tar.gz` |
| 镜像实测 | `COPY . .` 已把 3 个源码 tar 和展开的旧 `next.config.ts` 带进 `/app`；`tsconfig.json` 的 `include: **/*.ts` 会扫到它（`docs/OPERATIONS.md` 明确要求备份保持为 tar） |
| 容器身份 | `Dockerfile` **没有 `USER` 指令**，以 root 运行 |
| 测试夹具 | 5 个 `tests/fixtures/*-public-sample.*` 是真实公开样本，**无统一的「来源 URL + 采集时间 + 脱敏说明」**；其中 RSS 夹具含 `<content:encoded>` 整篇原文 HTML，再分发风险高于生产库里的 160 字摘要 |
| 依赖许可 | `package-lock.json` v3：直接生产依赖 MIT × 7、`class-variance-authority` Apache-2.0、`lucide-react` ISC；全依赖树另有 LGPL-3.0-or-later、MPL-2.0、CC-BY-4.0、CC0 等（多为开发依赖），需按运行时/构建期分开清点 |
| 机制现状 | 启动 4 秒首轮 + 每 2 小时 `setInterval`、进程内锁、25 秒单源超时、1.5M 字符上限、60 秒手动冷却 + 每 IP 10 分钟 8 次；**无新鲜度告警**，抓取成功不打日志；快照本机未开启 |
| 标识 | `package.json`：`daily-deals@0.1.0`；Compose `name`、容器名、镜像 tag 均为 `daily-free-info`；收藏键 `daily-deals-personal-v1` |

### 0.1 决策记录（2026-11-08 16:31 更新）

1. **许可证：已定 MIT**。已写入 `LICENSE`、`package.json` 的 `license` 字段与 `package-lock.json` 根条目；版权行暂用 `PerkRadar contributors`，如需改成真实姓名或组织由用户指定。`THIRD_PARTY_NOTICES.md` 与 README 许可段落已于本轮补齐（§0.3）。
2. **仓库初始化与远端：已授权**。远端为 `https://github.com/luobinger/PerkRadar.git`。只读探测（`git ls-remote`）显示仓库存在且**没有任何引用，是空仓库**，可安全初始化，无历史冲突。`git init -b main` 与 `remote add` 已完成；§1 现已全绿，可首次提交；**推送与发布仍要等 §2 全绿与 `v0.1.0` tag**（见 §5）。
3. **品牌切换窗口**：`v0.1.0` 只改对外文字，运行标识一律不动（见 §3）。

### 0.2 仓库边界与身份（本次实测，直接影响绑定动作）

- 本目录**位于上级目录的 Git 工作树内**，但父仓库 `.gitignore` 的 `/*` 忽略全部一级子目录，`git ls-files` 对本项目的跟踪数为 0，父仓库也没有远端。因此在本目录 `git init -b main` 建独立仓库不会污染上层仓库；**绝不能在上层工作树里执行 `git remote add`**，否则整个上层仓库会被指向 PerkRadar。
- 本机全局提交身份是真实姓名 + 私人邮箱；公开仓库的每次提交都会带上它。是否改用 GitHub `noreply` 邮箱或专用身份，需用户决定，agent 不擅自改全局配置。
- `gh auth login` 已补做并复核通过：登录账号 `luobinger`（keyring），`gh api user` 返回同名账号，token 含 `repo` / `workflow` 权限；git 凭据助手指向 `gh auth git-credential`。**是否真能 push 仍未实测**（未执行推送）。凭据不得写入仓库或任何文件。
- 全局 Git 存在 URL 重写：`https://github.com/` 的 **fetch 经 `https://gh-proxy.com/` 第三方代理**，**push 直连**原始地址（`url.*.insteadOf` / `pushInsteadOf`）。本地 `.git/config` 里存的是用户给的原始 URL。fetch 走第三方代理属于既有本机配置，本次未改动；涉及凭据时要留意。
- 本次已落地：`LICENSE`（MIT）、`.gitignore` 与 `.dockerignore` 的排除规则、`package.json` / `package-lock.json` 的 `license` 字段；`npm ci` / 测试 / 构建已在 §0.3 的干净环境里实跑复核。

### 0.3 本轮执行结果（2026-11-08 16:50，均为重新实跑）

**§1 已全绿**：

- **清洁**：内部会话记录与外部推送说明已移入被忽略的本地文档；`AGENTS.md` 的本机绝对路径、`docs/DEVELOPMENT.md` 的会话式审计与验收记录及示例时间、`docs/DATA_QUALITY.md` 的外部渠道表述均已中性化。`.gitignore` / `.dockerignore` 排除规则已落地，二次扫描确认待提交集合中无数据库、WAL/SHM、备份、压缩包、快照、日志、凭证或个人绝对路径。
- **许可**：`LICENSE`(MIT)、`package.json` / `package-lock.json` 的 `license` 字段、`THIRD_PARTY_NOTICES.md`、README 许可段落齐全。
- **对外说明**：README 已重写为「多来源优惠线索聚合」定位，含来源覆盖、筛选局限、未知截止时间、2 小时刷新与停机漏轮、默认 loopback、上传 GitHub ≠ 公网部署。
- **干净环境**：从仅含 83 个待跟踪文件的全新临时目录出发，`npm ci` → `npm test`（**35 项 / 12 套件全通过**）→ `npm run lint`（无告警）；`docker compose build --no-cache` 成功（70 秒，上下文 534 KB），隔离镜像 `perkradar-clean:local` 与端口 38481 启动，首轮 7/7 源成功、120 条真实数据、首页 200。容器内无 `tests/`、tar 包、备份目录、docs、AGENTS.md；`SYNTHETIC` 条数 0；启动日志无 TypeScript 联网安装、无权限错误。
- **默认安全**：`Dockerfile` 增加 `USER node`（uid 1000），两个场景均实测可建库与写入：① 全新空 data 目录 → 生成 deals.db 与 WAL/SHM、7/7 抓取；② 用在线备份恢复的 143 行旧库 → 读到 143 行、完成新一轮后 168 行、WAL 正常。端口仍仅 `127.0.0.1`。现网容器 `daily-free-info` 全程未重建、未受影响。验证时替换整个 data 目录曾踩到 bind mount 绑定 inode 的坑，改为只换目录内文件并强制重建容器后复测通过。
- **审计**：生产依赖 `npm audit --omit=dev --registry=https://registry.npmjs.org` 得到 `found 0 vulnerabilities`。本机默认 registry 是 `npmmirror`，不支持 audit 端点，直跑会报 `NOT_IMPLEMENTED`；CI 与本地复核须显式使用官方源。
- **夹具**：新增 `tests/fixtures/README.md` 逐文件标注来源、采集时间（未记录的明确写「未记录」，不编造）与脱敏说明；`appinn-public-sample.xml` 的整篇第三方正文已裁剪，裁剪后 35 项测试仍全通过。

**仍未完成**：§2 的 CI、数据质量反例集、可观测性、维护入口、来源合规文档；§3 的品牌统一与 `v0.1.0` tag。按 §5，首次提交可先做，推送与发布要等 §2 全绿。

---

## 1. 公开仓库前必须完成

### 1.1 仓库清洁

**要做**

0. **先确认仓库边界**：只在本项目目录执行 `git init -b main`；**不得在上层工作树里执行 `git remote add`**（见 §0.2）。绑定用 `git remote add origin https://github.com/luobinger/PerkRadar.git`，只写本地 `.git/config`，不推送。父仓库已忽略本项目，独立仓库不会污染上层。
1. 先做只读体检并输出清单：数据库及 WAL/SHM、日志、抓取快照产物（`latest.json`、`rounds/*.json`）、备份、部署压缩包、凭证、个人绝对路径、内部会话记录。注意 `src/lib/snapshot.ts` 是源码，**不能删**；要排除的是它写出的产物。
2. 把 4 个 `*.tar.gz` 与 `deployment-backups/` 移出仓库目录归档（默认不硬删、不覆盖已有归档，需用户确认目标）。展开的旧 `next.config.ts` 必须离开项目树，否则会继续被 TypeScript 扫到。
3. 清理文档里的本机与内部上下文：`AGENTS.md` 的本机绝对路径改为相对表述；README 的交付记录、聊天 routine 段移出公开文档（或放进被忽略的本地文档）；`docs/DEVELOPMENT.md` 的「云端某次审计/验收」改成不绑定会话的表述，保留结论与「锁文件变更后需重跑」的约束；`$HOME/...` 属通用占位符，确认其中没有真实用户名后保留。
4. `.gitignore` 追加：`/data/`、`*.db`、`*.db-wal`、`*.db-shm`、`*.tar.gz`、`/deployment-backups/`、`/reports/`、`/snapshots/`、`*.bak`、`*.log`、`latest.json`、`rounds/*.json`、`/.workbuddy/`。`/.workbuddy/` 是忽略而非删除——本地 agent 记忆不进公开仓库。**本次已落地**，仍需用 `git status --ignored` 复核实际效果。
5. `.dockerignore` 追加：`deployment-backups/`、`*.tar.gz`、`docs/`、`AGENTS.md`、`*.md.bak`、`reports/`、`snapshots/`、`.workbuddy/`（**本次已落地**）。**保留**构建必需项：`src/`、`public/`、`package.json`、`package-lock.json`、`next.config.mjs`、`tsconfig.json`、`postcss.config.mjs`、`eslint.config.mjs`、`components.json`。排除非运行文件后必须重跑一次构建。
6. 凭证扫描（`token` / `key` / `password` / `Bearer` / 绝对路径 / `.env*`）作为首次提交前的固定检查项；当前未发现凭证文件，但结论只对本次扫描有效。

**验收判据**：`git init` 后 `git ls-files` 中不含 `data/`、`*.db*`、`*.tar.gz`、`deployment-backups/`、`reports/`、`*.bak`、快照产物；`git status --ignored` 里它们显示为被忽略；`git remote -v` 属于本项目独立仓库而非上层工作树；全新克隆里没有 `./data`；`COPY . .` 后的镜像 `/app` 里没有 tar 包与备份目录。

**已知坑**：没有 `.git` 时「查历史」是空操作；一旦把 `deals.db` 或含绝对路径的文档提交进去，公开前就要用历史重写工具处理，成本远高于预防。

### 1.2 许可证

1. ~~按 §0.1 的决策写入完整许可证全文~~ **MIT 已定并已落地**：`LICENSE` 全文、`package.json` 与 `package-lock.json` 的 `license` 字段已写入。仍待办：README 许可段落（随 §1.3 重写时补）、版权持有人措辞确认。
2. 生成 `THIRD_PARTY_NOTICES.md`：逐个列出**生产依赖**的名称、版本、许可证、上游地址。`Dockerfile` 在 `npm run build` 后执行 `npm prune --omit=dev`，因此镜像内只有生产依赖；开发依赖（含 LGPL/MPL/CC-BY 等）单列一节说明「仅构建期，不随镜像分发」。
3. 具体义务：`class-variance-authority`（Apache-2.0）需保留其 LICENSE 与 NOTICE；`lucide-react`（ISC）、其余 MIT 依赖需保留版权与许可声明；基础镜像 `node:22-bookworm-slim` 内含 Node.js（MIT）与 Debian 系统包（各自许可），镜像分发时需在文档中说明；`node:sqlite` 是 Node 内置模块，不单独引入第三方许可。
4. 若选 GPLv3：确认与 Apache-2.0、MIT、ISC 等依赖的兼容性，并写明源码提供义务；若选 MIT：写明保留版权声明义务。法务结论不确定就标注「待确认」，不要写成确定结论。

**验收判据**：仓库根有 `LICENSE`；`THIRD_PARTY_NOTICES.md` 与 `package-lock.json` 的生产依赖逐项对得上；README、`package.json`、LICENSE 三处口径一致。

### 1.3 对外说明准确

README 首屏必须明确：

- **定位**：这是「多来源优惠线索聚合」，不是逐条认证的领取平台；条目只代表 feed 里有这条，不代表活动仍有效、账户里真有额度或条件已核实。
- **覆盖**：7 个来源及其形态（RSS/Atom、经 Jina 的 Markdown、Epic 静态端点），链接到 `docs/DATA_QUALITY.md` 与 `docs/SOURCES.md`（§2.5 建立）。
- **筛选局限**：关键词分类会误判；闲聊、求购、抽奖、推广、条件不明的标题都会进入列表；没有价格字段；RSS 自带栏目不参与分类。
- **未知截止时间**：除 Epic 的当前免费促销外，`expires_at` 为空；「7 天保留」是本库的留存规则，不是活动的真实截止时间。建议把界面的「在架 / 去领取」改为「已收录 / 打开原文」，或加显著免责说明。
- **刷新与漏轮**：进程内定时器每 2 小时一轮；笔记本休眠、Docker 未启动、容器停止都会停；**没有补轮队列**，重启会立刻再抓一轮并重排计划；`ok: true` 只证明能读库，全失败的一轮也会更新「更新时间」。
- **部署口径**：默认只监听 `127.0.0.1`，收藏与已领只在这台浏览器；**上传 GitHub ≠ 网站已公网部署**。

同时移除 README 里固定本机数据、交付记录、聊天 routine、云端会话历史。

**验收判据**：README 首屏含定位声明与「非公网部署」提示；文档表补上本清单与后续新增文档的链接；全文无本机绝对路径、无某次会话的运行数字。

### 1.4 干净环境安装验证

1. 从**全新空目录**开始：只带 `git ls-files` 里的文件，不带 `./data`、不带 `node_modules`、不带本机镜像缓存与旧数据库。
2. 按 README / `docs/OPERATIONS.md` 走完整流程：`docker compose -p daily-free-info config` → `up -d --build` → `/api/health` → `/api/deals`。用 `--no-cache` 构建或先移除本项目旧镜像标签（**不要清理其他镜像、不要 `docker system prune`**），确认 `npm ci` 只依赖锁文件与网络。
3. 检查 `docker compose config`：端口绑定只有 `127.0.0.1`；`tests/` 已被 `.dockerignore` 排除；构建日志里不出现「安装 TypeScript」（出现即说明又退回 `next.config.ts`）。
4. 首次启动约 4 秒后会自动抓一轮：`/api/deals.deals` 必须为空或仅含真实抓取结果，**不得出现 `SYNTHETIC`、夹具标题或示例优惠**；生产库不得由启动流程灌入样例。

**验收判据**：全新目录里自动生成 `data/deals.db` 且可写（含 WAL/SHM 创建）；health 返回 200；页面与 API 可用；首次结果中无夹具内容。此项必须在 §1.1 完成后执行，否则验证的是一个含旧备份的构建上下文。

### 1.5 默认安全

1. 继续 `127.0.0.1:${HOST_PORT:-38471}:38471`，**不得**改成 `0.0.0.0`。
2. **非 root 优先**：在 `Dockerfile` 增加非 root 用户（如 `USER node`，uid 1000）并处理 `/data` 属主。
   - **实测坑**：宿主 `./data` 当前属主是本机用户，`node:sqlite` 在 WAL 模式下要能创建 / 写入 `deals.db-wal`、`deals.db-shm`；macOS Docker Desktop 的 bind mount uid 映射与容器内 uid 不一致时，会出现 `SQLITE_CANTOPEN` 或只读。
   - **验收方式**：全新空目录 **和** 保留旧库的目录，两种场景各测一次；确认能建库、能写入、能完成一轮刷新。不通过就保留 root 并在 README / SECURITY.md 写明原因，**不要假称已经非 root**。
3. 复核并补测试/文档说明既有约束：60 秒手动冷却（持久化）、每 IP 10 分钟 8 次（内存态，重启清零）、25 秒单源超时、1.5M 字符上限、同源校验与 `Content-Length` 上限。公开前评估是否要把 IP 计数持久化或增加全局速率上限。
4. **若将来开放公网**：必须另行设计认证与访问控制（反向代理 + 认证 + TLS + 刷新接口鉴权）。现有 `/api/refresh` 没有身份校验，只靠同源请求头与限流，直接暴露现有端口等于开放一个可随意触发外链抓取的接口。

**验收判据**：端口仅 loopback；`docker inspect` 显示非 root 或有书面回退理由；限流、超时、响应大小上限有测试覆盖；README 明确「不提供公网部署」。

---

## 2. 首个正式版本应具备

### 2.1 持续集成

1. `.github/workflows/ci.yml`：Node 22 → `npm ci` → `npm test` → `npm run lint` → `npm run build` → `npm audit --omit=dev`。Node 版本必须显式固定（`node:sqlite` 依赖 Node 22 实验 API）。
2. 审计策略：历史记录显示完整 `npm audit` 有 11 项开发依赖告警（`shadcn` 的 `deepmerge`、`typescript-eslint` / `ts-morph` 的 `minimatch`）。**锁文件变更后必须重跑**，不能沿用历史数字。CI 把生产依赖审计设为必过，开发依赖告警单独出报告；不要让工具链波动拖垮所有检查。本机默认 registry 为 `npmmirror`，**不支持 audit 端点**（`NOT_IMPLEMENTED`），CI 与本地复核须显式指定官方源；本轮实测 `npm audit --omit=dev --registry=https://registry.npmjs.org` 得到 0 项。
3. 解析器测试固定样本：为 5 个 fixture 补「来源 URL + 采集日期 + 脱敏说明」。
   - **硬伤**：现有 `*-public-sample.*` 含 RSS `<content:encoded>` 整篇原文 HTML、推广正文与真实链接。优先改用 `tests/helpers.ts` 里现有的 `SYNTHETIC` 生成器构造同结构合成样本，只保留解析所需的形状；确需保留真实样本时，必须裁到必要字段、去掉正文与推广链接、注明采集时间与许可依据。仓库里放整篇第三方正文，再分发风险高于生产库中的 160 字摘要。
   - 保留 `SYNTHETIC` 命名，确保测试夹具不会混入生产数据。
4. **实时源检查单独运行**：`workflow_dispatch` + 可选 `schedule`，不得进入 PR 必过项。
   - **硬伤**：`npm run report`（`scripts/live-report.ts`）调用 `runRefresh`，会**写当前 `DATA_DIR` 的 `deals.db` 并占用进程内锁**，还会访问外网。放进 CI 主流程会污染数据库并让测试依赖上游。需指向临时 `DATA_DIR`、设置 `DISABLE_SCHEDULER=1`，或改造成只读探测。

**验收判据**：断网或上游 500 时，PR 检查靠固定样本仍全绿；实时源检查失败不阻塞合并；CI 日志能区分「测试失败」与「上游不可达」。

### 2.2 数据质量验收

1. 反例集至少覆盖：闲聊、求购、抽奖、已过期、未来促销（upcoming）、长期免费本体（无当前免费促销窗口）、限时礼包；逐条断言「不得误收 / 不得误判 / 允许结果为空」。
2. **核心原则：发现不了明确优惠时允许结果为空，不能拿普通帖子补数量。**
   - **与现状冲突**：当前实现是「综合 RSS/Atom 源按 7 天窗口全量入库 + 关键词分类」，闲聊、交易帖、避雷帖都会留在库里（实测在架条目中「其他」占多数，某轮新增几乎全为论坛闲聊）。这与原则直接矛盾，是产品取舍，不是加几个测试能绕过。
   - 两条路二选一并写进 README：① 改收录策略，只收带明确优惠信号的条目，允许 0 条；② 保留全量收录，但对外明确「线索聚合、非优惠清单」，并把 UI 文案与分类语义对齐。**不得两条混用**。
3. 补分类误判回归用例（例如「抽奖」「送会员了」「收优惠码」），以及「全反例输入 → 0 条入库」的用例。

**验收判据**：7 类反例均有测试；存在空结果用例；README 的产品语义与代码行为一致。

### 2.3 可观测性

1. 逐源记录：尝试时间、成功时间、解析数、收录数、失败原因。
   - 现状：`source_runs` 已有 `started_at / finished_at / fetched_count / inserted_count / error / final_url`，但失败分支只记时间与错误文本，缺少结构化原因分类；抓取成功时**完全不打日志**，容器日志只有 Next 启动信息。
   - 补齐：失败原因分类（超时 / HTTP 状态 / 格式不符 / 解析为空 / 响应过大），成功轮输出逐源摘要日志。
2. 明确提示三类异常：某源成功但 0 条、条数相对上一轮骤变、最近一轮超过阈值未结束。`docs/DATA_QUALITY.md` 里的「超过 2.5 小时报警、4 小时严重过时」目前是**建议、未实现**；实现后把文档措辞改成「已实现」并给出字段位置。
3. 验收：构造「全源 0 条」「数据过时」「某源骤变」三类测试；`/api/health` 或页面能给出可判定的提示；日志能回答「哪一轮、哪个源、耗时多少、为什么失败」。

### 2.4 维护入口

1. `CONTRIBUTING.md`：Node 22、`npm ci`、测试与夹具规范、PR 流程；**新增来源必须提供的证据**：来源 URL 与格式、注明采集时间的样本、使用条件/ToS 核查结论、字段映射、失败样例、回归测试、以及该源对「明确优惠信号」的判定方式。
2. `SECURITY.md`：支持版本、报告渠道、披露窗口；明确 `/api/refresh` 无鉴权、勿暴露公网；非 root 若回退需在此说明。
3. `.github/ISSUE_TEMPLATE/`：错报优惠、失效优惠、来源失效、新来源申请；模板要求附原文链接、抓取时间、期望与实际行为。
4. `CHANGELOG.md` 与 `v0.1.0` tag / Release notes，见 §3。

**验收判据**：四类文档与模板齐全且互相引用一致；「错报/失效」有可直接使用的提交路径；新增来源的证据清单可执行。

### 2.5 来源与合规说明

1. 新建 `docs/SOURCES.md`：7 个原始来源、实际请求 URL、格式、字段、更新频率、原文链接保留策略；明确只存必要摘要（标题 ≤ 300 字、摘要 ≤ 160 字、不存正文），不存凭证、Cookie、请求头。
2. 逐源核查使用条件 / ToS / robots，记录核查日期与结论，**不把「公开 RSS」等同于可任意再分发**。
3. 必须单独标注两处风险：
   - LINUX DO 经第三方 `r.jina.ai` 代理，等于把第三方服务纳入抓取链路；被阻断时按现有约定让该源失败，不改成直连、不做挑战绕过。
   - Epic 使用 `store-site-backend-static.ak.epicgames.com` 静态端点，不是公开承诺的稳定 API；结构或访问策略变化会导致整源失败。
4. 提供来源移除与内容纠错渠道（ISSUE_TEMPLATE + `SECURITY.md` 或专门联系入口），说明收到请求后的下架 / 移除流程与保留原文链接的边界。

**验收判据**：每源有「使用条件核查结论 + 核查日期」；上述两处风险有明确表述；`src/lib/source-defs.ts` 与文档逐项一致；仓库内不存第三方正文全文（含测试夹具，见 §2.1）。

---

## 3. 品牌、版本与发布口径（`v0.1.0`）

### 3.1 品牌：对外用 `PerkRadar`，运行标识不动

**可以改**：README 标题与简介、页面 `<title>` 与 `metadata.description`、文档措辞、仓库描述、`package.json` 的 `name`（同步 `package-lock.json` 根包名）。

**不得改**（避免丢状态，另开迁移窗口再议）：

- Compose `name: daily-free-info`、容器名、镜像 tag `daily-free-info:local`、命令里的 `-p daily-free-info`；
- 卷 `./data`、`deals.db` 文件名及 WAL/SHM 文件；
- 浏览器 `daily-deals-personal-v1` 键与 `{ claimed, favorites }` JSON 形状；
- SQLite 表名、列名、`SOURCE_DEFS` 的 id、端口 38471。

理由：改 Compose 项目名会新建一套容器与网络，改收藏键会让用户本机收藏与已领状态失效，改表结构/列名会让现有库不兼容。品牌改名不构成迁移这些状态的理由。

### 3.2 Release notes 必须并列两栏

- **已验证能力**（以本轮重新实跑为准，不沿用任何历史结论）：7 源抓取与单源失败隔离、Epic 当前免费窗口判定、7 天/到期留存边界、规范化 URL 去重、进程内调度与手动刷新限流、SSR 与 3 个 API、收藏/已领本地持久化、测试 / lint / build / CI、干净目录 Docker 启动、生产依赖审计。
- **已知限制**：线索聚合而非逐条认证；综合源混入闲聊/求购/抽奖（取决于 §2.2 的取舍结论）；除 Epic 外无真实截止时间；关键词分类会误判；新鲜度告警若未实现则明确列出；休眠/停机漏轮且不补抓；公开快照本机未开启；外部推送渠道不属本仓库、不与本机库同步；单人单实例、非公网服务；上游改版或反爬会导致整源失败。

### 3.3 发布口径

README 显眼位置写明：**上传 GitHub 只代表源码公开，不代表网站已公网部署**；默认仅监听 `127.0.0.1`，公开仓库不提供托管服务。

**验收判据**：tag `v0.1.0`；Release body 两栏齐全；README 无固定本机数据、无内部会话记录、无「已上线」表述；`package.json` 版本与 tag 一致。

---

## 4. 全局纪律（承接 `AGENTS.md`）

- 不把没抓到的写成抓到，不把夹具写进 `./data`，不把闲聊、新闻、抽奖或条件不明的标题说成已核实可领。
- 不自动注册付费服务、不擅自更换抓取源、不直连 `linux.do`、不绕过站点挑战；来源 URL 以 `src/lib/source-defs.ts` 为准。
- 不删除 `./data`，不清理浏览器里的 `daily-deals-personal-v1`；`git init` 与连接远端须用户确认。
- 只操作本项目：不对其他目录 `docker compose down`，不 `docker system prune`，不动其他容器、端口与卷。
- 默认不硬删：归档优先、经明确授权再移除；破坏性操作先备份。
- 每次改代码都实跑测试、lint、build；动到页面要在 1440 / 1280 / 390 宽度下看真实数据。**没跑过的检查不写成已通过**；生产镜像是否重建，以本机 `docker compose` 结果为准。
- 本文记录的本机运行数字属于瞬态，只在本地日志中留存，不写进公开 README / Release notes。

## 5. 完成定义（DoD）

按序推进：§1 全绿 → 首次提交前二次扫描 → 提交 → §2 全绿 → 打 `v0.1.0` → 推送与发布。当前 §1 已全绿（见 §0.3），`main` 分支与 `origin` 就绪，提交身份经用户确认沿用全局配置，推送凭据由 `gh` 提供。**首次提交可做；推送与发布仍要等 §2 全绿与 `v0.1.0` tag。** 任一项未实测通过，必须在 Release notes 的「已知限制」中列明，不得写成已完成。
