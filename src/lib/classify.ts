import type { Category } from "./types";

/**
 * Classification priority, first match wins:
 * 1. Epic source → 游戏 (Epic's feed is authoritative)
 * 2. Explicitly low-relevance title markers → 其他
 * 3. Epic / 游戏 / 喜加一 / Steam → 游戏
 * 4. 会员 / 订阅 / 会员版 / Pro → 会员订阅
 * 5. 限免 / 免费领取 → 限免
 * 6. 白嫖 / 免费 / 永免 → 免费白嫖
 * 7. 折扣 / 优惠码 / 大促 / 降价 / 打折 / 爆降 → 低价优惠
 * 8. otherwise → 其他
 *
 * Latin tokens use a letter boundary, so digits may follow (`steam98`)
 * but `Professional`, `Product`, and `steamer` do not match.
 * RSS category tags are ignored. Uncertain software-news titles stay 其他.
 * `打折` is recorded as a synonym of 折扣, `爆降` as a synonym of 降价,
 * and `永免` as a synonym of 免费, because those spellings show up in real titles.
 */
function hasLatinToken(title: string, word: string): boolean {
  const pattern = new RegExp(`(?:^|[^A-Za-z])${word}(?:[^A-Za-z]|$)`, "i");
  return pattern.test(title);
}

function isLowRelevance(title: string): boolean {
  return (
    /抽奖|开奖|抽取|求购|收购|求助|闲聊|讨论|新闻|资讯|公告|更新|评测|测评|避雷|吐槽|预测/.test(title) ||
    /(?:^|[\s【\[])(?:收|求)(?:购|助|一个|一下|个)?(?:[A-Za-z0-9._-]{0,16}|团队|管理员|家庭|企业|共享|朋友|个人|学生|开发者|机场)?[\s:：]*(?:优惠码|会员|账号|主机|路由器|套餐|商品|上车|自建)/.test(title) ||
    /[?？]/.test(title) ||
    /有没有|有无|是否|请问|是真的吗|能不能|可不可以/.test(title)
  );
}

export function classify(title: string, sourceId: string): Category {
  if (sourceId === "epic") return "游戏";
  if (isLowRelevance(title)) return "其他";
  if (
    hasLatinToken(title, "epic") ||
    title.includes("游戏") ||
    title.includes("喜加一") ||
    hasLatinToken(title, "steam")
  ) {
    return "游戏";
  }
  if (
    title.includes("会员") ||
    title.includes("订阅") ||
    title.includes("会员版") ||
    hasLatinToken(title, "pro")
  ) {
    return "会员订阅";
  }
  if (title.includes("限免") || title.includes("免费领取")) return "限免";
  if (title.includes("白嫖") || title.includes("免费") || title.includes("永免")) return "免费白嫖";
  if (
    title.includes("折扣") ||
    title.includes("优惠码") ||
    title.includes("大促") ||
    title.includes("降价") ||
    title.includes("打折") ||
    title.includes("爆降")
  ) {
    return "低价优惠";
  }
  return "其他";
}
