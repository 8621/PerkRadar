# 来源与合规说明

本文说明数据从哪来、存什么、以及使用边界。**公开可访问不等于可任意再分发**；本文不替代对各站条款的法律判断。

## 来源清单

URL 写死在 `src/lib/source-defs.ts`，调用方不能替换。

| id | 名称 | 请求 URL | 格式 | 收录规则 | 到期时间 |
| --- | --- | --- | --- | --- | --- |
| `linuxdo` | LINUX DO 福利羊毛 | `https://r.jina.ai/https://linux.do/c/welfare/36.rss` | 经 Jina 转换的 Markdown | 拆出 `### [标题](.../t/topic/<数字>)` 与 RFC822 日期；解析不到整源失败 | 无 |
| `v2ex` | V2EX 推广 | `https://www.v2ex.com/feed/promotions.xml` | Atom | feed 条目，链接去 `#reply0` | 无 |
| `epic` | Epic | `https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=zh-CN&country=CN&allowCountries=CN` | JSON | 仅 `start <= now < end` 且折扣价为 0 的当前促销 | 促销结束时间 |
| `nodeseek` | NodeSeek | `https://rss.nodeseek.com/` | RSS/Atom | feed 条目 | 无 |
| `appinn` | 小众软件 | `https://www.appinn.com/feed/` | RSS/Atom | feed 条目 | 无 |
| `ghxi` | 果核剥壳 | `https://www.ghxi.com/feed` | RSS/Atom | feed 条目 | 无 |
| `iplaysoft` | 异次元软件世界 | `https://www.iplaysoft.com/feed` | RSS/Atom | 请求会 301，跟随到最终地址 | 无 |

综合源按 7 天窗口全量收录，包含闲聊、求购、抽奖与软件新闻；它们只是线索，不是已核实的优惠。分类规则、时间边界与每轮验收见 [DATA_QUALITY.md](DATA_QUALITY.md)。

## 只存必要字段

入库字段：标题（≤300 字）、规范化后的原文链接、摘要（≤160 字，没有正文就留空）、来源提供的发布时间、Epic 的促销结束时间、首次收录时间与轮次 id。**不存正文全文、图片、Cookie、请求头、账号、邮箱或凭证**，也不补写来源没有提供的价格或日期。原文链接一律保留，页面「打开原文」指向规范化后的地址。

测试夹具同样遵守这条边界：`tests/fixtures/README.md` 记录来源与采集时间，正文全文已裁剪，且 `tests/` 不进生产镜像。

## 使用条件核查状态

核查日期：2026-11-08。下表记录的是**当前能确认的事实**，不是授权结论。

| 来源 | 公开可访问 | 书面条款核查 | 结论 |
| --- | --- | --- | --- |
| 7 个来源 | 是（按上表 URL 可读取） | **未完成逐站书面核查** | 仅按「读取公开 feed、保留原文链接、只存短摘要」的最低限度使用；维护者需按各站 ToS / robots 逐条复核后再扩大用途 |

因此：

- 不把抓取到的标题与摘要视为可自由再分发的内容资产；本仓库只把它们作为运行时的线索索引。
- 若来源方要求停止抓取、移除内容或更正表述，按下面渠道处理，不要求对方先证明损失。
- 新增来源必须按 [CONTRIBUTING.md](../CONTRIBUTING.md) 提供使用条件核查结论与采集时间。

### 两处需要单独标注的风险

1. **LINUX DO 经第三方 `r.jina.ai` 代理**。这等于把第三方服务纳入抓取链路，其可用性、条款与内容转换规则不由本仓库控制。被阻断时按现有约定让该源失败、下一轮再试，不改成直连，也不做挑战绕过。
2. **Epic 使用静态后端端点**，不是公开承诺的稳定 API。响应结构或访问策略变化会导致整源失败；代码只识别当前免费促销窗口，不识别「长期免费本体」与「限时礼包」的语义差别。

## 移除与纠错渠道

- 内容错报、失效条目、来源失效：使用 `.github/ISSUE_TEMPLATE/` 里的模板，附原文链接、发现时间与期望行为。
- 涉及许可、隐私或授权：按 [SECURITY.md](../SECURITY.md) 走私密渠道，不要公开贴数据。
- 维护者收到请求后的处理顺序：先确认涉及的来源或条目 → 从库中移除或暂缓抓取 → 复核解析与分类规则 → 在变更记录里说明。原文链接是否继续保留，以来源方要求为准。
