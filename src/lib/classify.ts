import type { Category } from "./types";

/**
 * Classification priority, first match wins:
 * 1. Epic source, or title contains Epic / 游戏 / 喜加一 / Steam → 游戏
 * 2. 会员 / 订阅 / 会员版 / Pro → 会员订阅
 * 3. 限免 / 免费领取 → 限免
 * 4. 白嫖 / 免费 / 永免 → 免费白嫖
 * 5. 折扣 / 优惠码 / 大促 / 降价 / 打折 / 爆降 → 低价优惠
 * 6. otherwise → 其他
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

export function classify(title: string, sourceId: string): Category {
  if (sourceId === "epic") return "游戏";
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
