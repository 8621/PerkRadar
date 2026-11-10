# 运维

命令都在项目目录执行，并且只带 `-p daily-free-info`。不要对其他目录 `docker compose down`，不要 `docker system prune`，不要 `docker compose down` 不带项目名。默认只把端口发布到 `127.0.0.1`，不是公网。

机器休眠、关机、Docker Desktop 没启动，或这个容器被 stop，抓取都会停。`restart: unless-stopped` 只在 Docker 自己还在运行、且容器不是被手动 stop 时拉起它。

## 日常命令

```bash
docker compose -p daily-free-info config
docker compose -p daily-free-info up -d --build
docker compose -p daily-free-info ps
docker compose -p daily-free-info logs -f --tail=200
docker compose -p daily-free-info restart
docker compose -p daily-free-info stop
docker compose -p daily-free-info start
```

`config` 用来检查这次会使用的项目名、端口和卷，不会启动容器。`up -d --build` 构建镜像并启动。容器名是 `daily-free-info`，镜像名是 `daily-free-info:local`。宿主目录 `./data` 挂到容器内 `/data`。SQLite 文件是 `./data/deals.db`，WAL 模式下旁边还可能有 `deals.db-wal` 和 `deals.db-shm`。

容器以镜像内置的 `node` 用户（uid 1000）运行，不是 root。`./data` 是宿主 bind mount，该 uid 必须能创建并写入上述三个文件。换到 uid 映射不同的宿主时，先确认 `./data` 对 uid 1000 可写，否则健康检查会返回 503「数据库不可读」。不要用 `chmod 777` 绕过权限。

访问：

```bash
curl -sS http://127.0.0.1:38471/api/health
curl -sS http://127.0.0.1:38471/api/deals
curl -sS -X POST http://127.0.0.1:38471/api/refresh
```

这些 `curl` 命令不带 `Origin`，而刷新接口对不带 `Origin` 的请求仍放行，所以本机排障能直接触发手动刷新；带 `sec-fetch-site: cross-site` 或与 `Host` 不符的 `Origin` 才会被拒绝 403。接口防护细节见 [SECURITY.md](../SECURITY.md)，结构化日志见 [DEVELOPMENT.md](DEVELOPMENT.md)。

若 38471 已被别的程序占用，只改宿主端口，不要改容器内端口，也不要去停别的项目：

```bash
HOST_PORT=38481 docker compose -p daily-free-info up -d --build
curl -sS http://127.0.0.1:38481/api/health
```

健康检查在容器内请求 `http://127.0.0.1:38471/api/health`，每 30 秒一次，超时 5 秒，重试 3 次，启动宽限 60 秒。它通过只说明 HTTP 成功，也就是数据库还能读。

同一时间只运行这一个应用进程。第二个容器会各自抓取并抢同一个 SQLite 文件。

## 排障

| 现象 | 先看什么 |
| --- | --- |
| 浏览器打不开 | `docker compose -p daily-free-info ps`。Docker 是否启动。端口是否用了 `HOST_PORT`。只应访问 `127.0.0.1` |
| 健康 503，`数据库不可读` | `./data` 是否存在、当前用户能否写。不要删库；先按下面备份，再看权限。读库失败会记 `health_check_failed` / `deals_read_failed` 日志；`GET /api/deals` 同样会返回 503 `数据库不可读` |
| 来源失败或超时 | `/api/health` 的 `failures`，以及 `docker compose -p daily-free-info logs` 里 `[deals]` 的 `source_round.reason` 与 `error`。25 秒超时记为「超时」（`timeout`）；HTTP 错误状态（`http_status`）、响应过大（`response_too_large`）、格式 / 解析错误（`malformed_response`）各有分类。LINUX DO 格式不对会写明可能被阻断。不要改去直连 |
| 想按轮次看完整日志 | 用 [DEVELOPMENT.md](DEVELOPMENT.md)「结构化日志」里按 `roundId` 过滤的命令；`at` 是 UTC，页面时间是北京时间。`up -d --build` 重建容器后旧日志不可见，留档要先导出 |
| 某源 0 条但 `lastOk` 为真 | 这次 feed 解析结果是空的，旧行是否还在由 7 天和到期规则决定 |
| 页面时间看起来差 8 小时 | 页面标签按 `Asia/Shanghai` 格式化。容器未设置 `TZ`，库内是 Unix 毫秒。先对照 `fetchedAt` 和 `fetchedAtBeijing`，不要只看容器 `date` |
| 手动刷新 409 | 已有一轮在跑，等它结束 |
| 手动刷新 429 | 60 秒冷却，或同一 IP 10 分钟超过 8 次 |
| 手动刷新 403 | `sec-fetch-site: cross-site`，或 `Origin` 的主机与 `Host` 不一致。本机 `curl` 不带这些头，不受影响 |
| 重启后很快又抓了一轮 | 这是未设置 `DEALS_SKIP_BOOT` 时的正常行为，见 [DATA_QUALITY.md](DATA_QUALITY.md) |
| 停机几小时后只多了一轮 | 代码不会把错过的每 2 小时都补抓一遍 |

构建日志里若再出现安装 TypeScript，说明镜像又在用 `next.config.ts`。当前仓库使用 `next.config.mjs`，启动不应为了配置文件联网安装依赖。

## 备份

不要在数据库正在写的时候只复制 `deals.db` 一个文件。WAL 模式下，最新写入可能在 `deals.db-wal` 里，单文件副本会不一致。

### 在线备份

`node:sqlite` 的 `backup()` 可对打开着的 WAL 库生成一致副本：函数返回 Promise，完成后目标文件可以只读打开并读到已写入的行。若对正在服务的库返回 `database is locked`，改用下一节的停机复制。

在项目目录、且本机有 Node 22 时，可以写到 `./data` 以外的归档目录，避免和活库缠在一起：

```bash
mkdir -p "$HOME/free-info-archives"
node --experimental-strip-types << 'EOF'
import { DatabaseSync, backup } from "node:sqlite";
const db = new DatabaseSync("./data/deals.db");
await backup(db, process.env.HOME + "/free-info-archives/deals-online.db");
db.close();
EOF
```

这个命令会打开现有数据库。确认它没有报错之后，再把目标文件改成带日期的名字。不要在同一命令里删除现有的 `deals.db`。

### 停机后复制三个文件

只停止本项目，等容器退出，再复制当时存在的文件：

```bash
docker compose -p daily-free-info stop
dest="$HOME/free-info-archives/stopped-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$dest"
cp -p ./data/deals.db "$dest/"
if [ -f ./data/deals.db-wal ]; then cp -p ./data/deals.db-wal "$dest/"; fi
if [ -f ./data/deals.db-shm ]; then cp -p ./data/deals.db-shm "$dest/"; fi
ls -l "$dest"
docker compose -p daily-free-info start
```

停机后这次复制到 `$dest` 的文件是一套。恢复时使用这一套，不要和更早的备份混放。复制前先 `ls "$dest"`，确认没有盖住另一份备份。

## 恢复

先按上一节再做一份当前库的备份。然后只停止本项目，把现有文件改名留在旁边，而不是删除：

```bash
docker compose -p daily-free-info stop
mkdir -p ./data/aside-$(date +%Y%m%d-%H%M)
mv ./data/deals.db ./data/deals.db-wal ./data/deals.db-shm ./data/aside-$(date +%Y%m%d-%H%M)/ 2>/dev/null || true
```

若恢复的是 `backup()` 生成的单个文件，把它放到 `./data/deals.db`。不要把旧的 `-wal` 或 `-shm` 留在旁边，否则 SQLite 可能把旧日志应用到新文件上。

若恢复的是停机时复制的三个文件，就把当时存在的那几个文件按原名放回 `./data/`。

```bash
docker compose -p daily-free-info start
curl -sS http://127.0.0.1:38471/api/health
```

确认条数和更新时间符合预期之前，不要清掉 `aside-*` 目录。

## 回滚镜像和源码

回滚前保留两样东西：当前还能用的镜像，以及当前源码的 tar。镜像可以用本项目的标签另存，例如：

```bash
docker image tag daily-free-info:local daily-free-info:before-rollback
```

源码和部署包打成 tar，放在仓库外面，例如 `$HOME/free-info-archives/`。不要在项目目录里再展开一份旧源码。`tsconfig.json` 的 `include` 含有 `**/*.ts`，`tsconfig.json` 与 `eslint.config.mjs` 现在排除 `deployment-backups/`；但项目树其它位置若留下旧的 `next.config.ts` 或其他 `.ts`，TypeScript 仍会扫到它们。`deployment-backups` 保持为 tar，不要展开后留在项目树里。

回滚源码时只替换有记录的应用文件，不要用旧包覆盖 `./data`、`.env`，或用户后来自己加的文件。换回旧镜像后执行：

```bash
docker compose -p daily-free-info up -d --build
```

只有在明确要使用 `before-rollback` 这个标签、且 Compose 文件也改回对应构建时，才需要另作镜像标签处理。当前 Compose 固定构建 `daily-free-info:local`，所以上面的 `up -d --build` 会按当时目录里的源码重新构建。
