# 接手本目录

这份说明给在本仓库协助维护 PerkRadar 的自动化 agent 与贡献者。它只约束本仓库的维护方式。

先读 [README.md](README.md)，再按任务读 [docs/DATA_QUALITY.md](docs/DATA_QUALITY.md)、[docs/OPERATIONS.md](docs/OPERATIONS.md) 或 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 先看真实状态

改代码之前，先确认当前运行状态：

```bash
curl -sS http://127.0.0.1:38471/api/health
curl -sS http://127.0.0.1:38471/api/deals
```

`/api/health` 返回 200 只说明进程能读数据库。对照 [docs/DATA_QUALITY.md](docs/DATA_QUALITY.md) 里的每轮清单，看成功来源数、失败原因、最后一轮时间、发布时间和到期时间。不知道就直说，不要用旧数字填上。

## 不可退让

- 不把没抓到的优惠写成抓到了，不把测试夹具写入 `./data`。
- 不把普通闲聊、新闻、抽奖或条件不明的标题说成已经核实可领。
- 不把页面上的在架条数当成逐条官方确认。
- 来源 URL 以 `src/lib/source-defs.ts` 为准。LINUX DO 必须走现有的 Jina 地址。不要改成直连，也不要绕过站点挑战。
- 不自动注册付费服务，不擅自更换抓取源。
- 不删除 `./data`，不清理浏览器里的 `daily-deals-personal-v1`。
- 数据库表结构要保持兼容。收藏键名和 `{ claimed, favorites }` 这个 JSON 形状不要改，否则浏览器里已保存的状态会丢。

## 可以做的事

可以在这个目录里开发、修缺陷、补测试、管理依赖和 Docker。仓库已在本目录初始化（`main` 分支），远端见 `git remote -v`；文档只写当前状态，不写历史交付状态。

只操作这个项目。不要 `docker compose down` 其他目录，不要 `docker system prune`，不要改其他容器、端口和卷。

改完用实际行为验收：该跑的测试要跑，页面要打开看。没有跑过的检查不要写成已经通过。生产镜像是否重新构建，以实际 `docker compose` 的结果为准。
