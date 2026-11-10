# 参与维护

## 本地准备

- Node.js 22（`node:sqlite` 是 Node 22 的实验 API）与 npm 10。`package.json` 声明 `engines.node >=22`，`.nvmrc` 为 22，CI 两个 workflow 固定 Node 22。
- `npm ci`，然后按 `npm test` → `npm run lint` → `npx --no-install tsc --noEmit` → `npm run build` 验收，完整顺序见本文「改动流程」。测试项数以 `npm test` 输出为准，不写进文档或注释。
- 本机 Docker 启停见 [docs/OPERATIONS.md](docs/OPERATIONS.md)；默认只监听 `127.0.0.1:38471`。

## 测试约定

- `npm test` 只用 `tests/fixtures/` 的固定样本与 `tests/helpers.ts` 的 `SYNTHETIC` 生成器：**不访问外网**、不写 `./data`。
- 每个固定样本必须在 `tests/fixtures/README.md` 注明来源 URL、采集时间（未记录就写「未记录」，不要编造）与脱敏说明。
- 能表达同样解析形状时优先用合成样本，不要继续转载第三方正文；测试夹具不进生产镜像（`.dockerignore` 排除 `tests/`）。
- 实时源检查单独运行（`.github/workflows/live-sources.yml`），不是 PR 必过项，避免上游波动拖垮所有检查。

## 新增来源需要提供的证据

1. 来源 URL、格式（RSS 2.0 / Atom / JSON / Markdown）、请求方式，以及跟随重定向后的最终 URL。
2. 该源的允许域名（含子域）：条目链接不在本源域名内会被丢弃，见 `src/lib/source-defs.ts` 的 `allowedHosts`。
3. 注明采集时间的样本文件，以及覆盖失败形态的反例（阻断页、空 feed、格式变化、Epic 空商品列表、跨域名条目链接）。
4. 该源使用条件 / ToS / robots 的核查结论与核查日期。不把「公开可访问」等同于可任意再分发，见 [docs/SOURCES.md](docs/SOURCES.md)。
5. 字段映射：标题、链接、发布时间、可选到期时间；说明哪些字段拿不到、程序会留空而不是猜测。链接须满足 http/https、长度不超过 2048 字符、不含 `user:pass@` 凭证；发布时间早于 2000-01-01 或晚于当前时刻 +7 天会被记为 `null`。
6. 该源如何区分明确优惠线索与普通帖子。若无法区分，必须明确写出它会把闲聊、求购、抽奖一并收录，并在 README 的已知限制里同步。
7. 对应的解析器测试、分类测试与留存边界测试。

来源 URL 写死在 `src/lib/source-defs.ts`，调用方不能替换。LINUX DO 必须走现有 Jina 地址，不要改成直连或绕过站点挑战；V2EX 必须用复数 `promotions.xml`。

## 改动流程

1. 先看 `/api/health` 与页面，记下改之前的来源成功数、最后更新时间。
2. 改代码，把预期写进 `tests/`。
3. 依次跑 `npm test` → `npm run lint` → `npx --no-install tsc --noEmit` → `npm run build` → `git diff --check`；动到页面还要在 1440 / 1280 / 390 宽度下看真实数据，并用 `preview check` 核对控制台报错、失败请求与横向溢出。真实数据路径除搜索、来源、分类、只看新增、收藏、已领、排序、刷新、重置、刷新后状态保留外，还要走默认隐藏「其他」这条：首屏可见条数与「已隐藏 N 条」提示、「查看全部线索」开关、与只看新增组合、显式点「其他」分类或我的收藏时不隐藏、结果为空提示打开开关、重置回默认隐藏、刷新后开关保留（`daily-deals-show-all-v1`）；本地 `/demo` 的 7 条示例默认隐藏 1 条「其他」，开关只在当前页面内存生效、刷新重置，「只看新增」仍为 3 条。验收顺序与异常路径以本节流程和 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)「视觉验收」为准；单次验收记录属本地产物，不随公开仓库发布。
   - 不要在 dev server 运行时执行 `npm run build`：两者共用项目根目录的 `.next`，会让 dev 报 `ENOENT ... _buildManifest.js.tmp.*` 并返回 500。需要构建时先停 dev，必要时删除 `.next`，再启动 dev；Docker 内的构建不共用这个目录。
4. 生产依赖有变动时重跑 `npm audit --omit=dev --registry=https://registry.npmjs.org`。本机默认 npm 镜像不支持 audit 端点，本地复查要手动加 `--registry=https://registry.npmjs.org`；CI 已显式指定官方 registry。
5. 抓取、解析或接口逻辑有变动时，结构化日志沿用 `[deals] {...}` 前缀与事件字段（见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)），失败用 stderr、成功用 stdout，不写标题正文、Cookie、请求头或个人状态。
6. 需要更新容器时按 [docs/OPERATIONS.md](docs/OPERATIONS.md) 用 `docker compose -p daily-free-info up -d --build` 重建，只操作本项目，不改容器名、端口或卷。

## 不可退让

不把没抓到的写成抓到、不把测试夹具写进 `./data`、不把闲聊或抽奖说成已核实可领、不改数据库表结构与 `daily-deals-personal-v1` 的形状、不删除用户数据、不把现有端口直接暴露到公网。`TRUST_PROXY_HEADERS=1` 只在确有可信反向代理时开启。结构化日志不写标题正文、Cookie、请求头或个人状态。没跑过的检查不要写成已通过。
