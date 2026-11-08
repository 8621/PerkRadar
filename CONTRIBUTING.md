# 参与维护

## 本地准备

- Node.js 22（`node:sqlite` 是 Node 22 的实验 API）与 npm 10。
- `npm ci`，然后 `npm test`、`npm run lint`、`npm run build`。
- 本机 Docker 启停见 [docs/OPERATIONS.md](docs/OPERATIONS.md)；默认只监听 `127.0.0.1:38471`。

## 测试约定

- `npm test` 只用 `tests/fixtures/` 的固定样本与 `tests/helpers.ts` 的 `SYNTHETIC` 生成器：**不访问外网**、不写 `./data`。
- 每个固定样本必须在 `tests/fixtures/README.md` 注明来源 URL、采集时间（未记录就写「未记录」，不要编造）与脱敏说明。
- 能表达同样解析形状时优先用合成样本，不要继续转载第三方正文；测试夹具不进生产镜像（`.dockerignore` 排除 `tests/`）。
- 实时源检查单独运行（`.github/workflows/live-sources.yml`），不是 PR 必过项，避免上游波动拖垮所有检查。

## 新增来源需要提供的证据

1. 来源 URL、格式（RSS 2.0 / Atom / JSON / Markdown）、请求方式，以及跟随重定向后的最终 URL。
2. 注明采集时间的样本文件，以及覆盖失败形态的反例（阻断页、空 feed、格式变化）。
3. 该源使用条件 / ToS / robots 的核查结论与核查日期。不把「公开可访问」等同于可任意再分发，见 [docs/SOURCES.md](docs/SOURCES.md)。
4. 字段映射：标题、链接、发布时间、可选到期时间；说明哪些字段拿不到、程序会留空而不是猜测。
5. 该源如何区分明确优惠线索与普通帖子。若无法区分，必须明确写出它会把闲聊、求购、抽奖一并收录，并在 README 的已知限制里同步。
6. 对应的解析器测试、分类测试与留存边界测试。

来源 URL 写死在 `src/lib/source-defs.ts`，调用方不能替换。LINUX DO 必须走现有 Jina 地址，不要改成直连或绕过站点挑战；V2EX 必须用复数 `promotions.xml`。

## 改动流程

1. 先看 `/api/health` 与页面，记下改之前的来源成功数、最后更新时间。
2. 改代码，把预期写进 `tests/`。
3. 依次跑 `npm test` → `npm run lint` → `npm run build`；动到页面还要在 1440 / 1280 / 390 宽度下看真实数据。
4. 生产依赖有变动时重跑 `npm audit --omit=dev --registry=https://registry.npmjs.org`。
5. 需要更新容器时用 `docker compose -p daily-free-info up -d --build`，只操作本项目。

## 不可退让

不把没抓到的写成抓到、不把测试夹具写进 `./data`、不把闲聊或抽奖说成已核实可领、不改数据库表结构与 `daily-deals-personal-v1` 的形状、不删除用户数据、不把现有端口直接暴露到公网。没跑过的检查不要写成已通过。
