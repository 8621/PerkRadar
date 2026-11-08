# 解析器固定样本

这些文件只供 `npm test` 使用，不会写入生产库；生产镜像由 `.dockerignore` 排除整个 `tests/` 目录。测试里另有 `tests/helpers.ts` 生成的 `SYNTHETIC` 数据，与下列公开样本分开。

| 文件 | 来源 | 采集时间 | 内容与脱敏说明 |
| --- | --- | --- | --- |
| `v2ex-public-sample.xml` | `https://www.v2ex.com/feed/promotions.xml`（Atom） | 条目自带时间 `2026-11-08T05:08:49Z` | 单条推广条目；保留原文链接与 `#reply0` 供规范化测试；无账号、邮箱或追踪参数 |
| `linuxdo-public-sample.md` | `https://r.jina.ai/https://linux.do/c/welfare/36.rss`（Markdown） | 条目自带日期 `2026-11-08` | Jina 返回的列表结构；无正文，简介固定为空 |
| `appinn-public-sample.xml` | `https://www.appinn.com/feed/`（RSS 2.0） | **未记录**（首次纳入仓库 2026-11-08） | 只保留解析所需的标题、链接、日期与短描述；`<content:encoded>` 的整篇正文已裁剪，避免转载第三方全文 |
| `iplaysoft-public-sample.xml` | `https://www.iplaysoft.com/feed`（RSS 2.0） | **未记录**（首次纳入仓库 2026-11-08） | 单条条目，保留标题、链接与描述；不含账号信息 |
| `epic-public-sample.json` | Epic `freeGamesPromotions` 静态端点 | **未记录**（首次纳入仓库 2026-11-08） | 保留商品与促销字段结构，用于当前免费窗口判定 |

## 约定

- **不编造采集时间**。样本里没有采集时刻的，明确写「未记录」；维护者补齐后更新本表。条目发布时间不等于样本采集时间。
- 样本不含账号、邮箱、Cookie、请求头或凭证；原文链接保留，用于去重与规范化测试。
- 公开可访问不等于可任意再分发。新增或更新样本前核查来源使用条件，见 [docs/OPEN_SOURCE_CHECKLIST.md](../../docs/OPEN_SOURCE_CHECKLIST.md) §2.5；能表达同样解析形状时，优先用 `tests/helpers.ts` 的 `SYNTHETIC` 生成器，而不是继续转载第三方正文。
- 修改样本后必须重跑 `npm test`：解析断言与样本内容一一对应。
