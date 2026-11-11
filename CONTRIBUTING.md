# 参与维护

使用 Node.js >=22.13，CI 验证 22.13 与 24。依赖用 npm ci；保持 Next/React 等主版本不变，升级依赖禁止 audit fix --force。

## 验证

```bash
npm run lint
npx tsc --noEmit --incremental false
npm test
npm run build
git diff --check
npm audit --omit=dev --registry=https://registry.npmjs.org
npm audit --registry=https://registry.npmjs.org
```

默认 npm 镜像可能没有审计端点；本地审计和依赖维护可显式使用官方 registry，不修改用户全局 npm 配置。不要在运行中的 dev/start 共用 .next 上构建；可用隔离副本及 NEXT_DIST_DIR，DATA_DIR 指向临时目录，DISABLE_SCHEDULER=1、PERKRADAR_OFFLINE=1，绝不可碰用户生产库或真实来源。

单元测试仅使用合成夹具、内存或临时数据库；不访问外网、不写 ./data。新增来源需提供 URL/最终地址、格式、允许域名、注明采集时间的脱敏样本、ToS/robots 核查、字段映射、成功与结构漂移/限流/跨域反例。LINUX DO 继续走 Jina，不绕过挑战。

分类评分变更要覆盖型号 Pro、明确优惠中的问号和更新词、抽奖/求购负例；默认在读时重算，不批量改写用户分类，可用 PERKRADAR_STORED_CATEGORIES 回退。存储键改名保留旧键兼容，写入失败不得丢当前内存操作。

页面验收：1440/1280/390 宽度、键盘操作、无横向溢出、搜索与来源/类别/新增/收藏/已领/排序、加载范围、重置显示全部、隐藏其他显式偏好、搜索始终不隐藏匹配项、跨标签同步、存储失败、断网恢复、30 秒更新及 refocus、过期淘汰。认证需验 Bearer/会话、篡改/过期、无令牌 401、UI 登录跳转；真实抓取的 live report 是独立工作流，不是 PR 必过检查。

数据库更改必须版本化事务迁移，使用临时复制库确认迁移前后行数和完整性，不把真实库或备份提交。运维改名遵守 docs/OPERATIONS.md 的停机窗口和回滚指引；本次代码提交不等于批准部署。日志不能含正文、凭证、Cookie、请求头或个人状态。没跑过的检查不能写成已通过。
