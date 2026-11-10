import type { Category } from "./types";

export type Classification = {
  category: Category;
  contentType: "deal" | "discussion" | "uncertain";
  confidence: "high" | "medium" | "low";
  score: number;
};

function token(title: string, word: string): boolean {
  return new RegExp(`(?:^|[^A-Za-z])${word}(?:[^A-Za-z]|$)`, "i").test(title);
}

/** Wording that states an offer outright. Worth 5: survives one question mark or a mild penalty. */
const STRONG =
  /限免|免费领|优惠[码券]|折扣码|兑换码|大促|促销|特价|降价|打折|爆降|折扣|永免|白嫖|秒杀|立减|满减|返现|返利|半价|史低|新低|羊毛|薅|红包|福利|赠送|买一送一|首月|黑五|双十一|双\s*11|(?:^|[^\d.])\d(?:\.\d)?\s*折|[0零]\s*元(?:购|领|撸|体验|试用)/;

/** Weaker hints. Worth 3: enough on their own, not enough against a question. */
const MEDIUM =
  /免费|优惠|(?:注册|新人|新用户|评论|留言)[^，。,.!！]{0,6}送|送[^，。,.!！]{0,8}(?:额度|会员|流量|时长|积分|余额)|体验额度|低至|\d+\s*%\s*off/i;

const FREEBIE = /白嫖|免费|永免|赠送|羊毛|薅|红包|福利|返现|返利|体验额度|送[^，。,.!！]{0,8}(?:额度|会员|流量|时长|积分|余额)|[0零]\s*元/;

/** "收/求 + 目标" 这类求购帖，目标前允许夹一个短品牌词。 */
const REQUEST =
  /(?:^|[\s【\[])(?:收|求)(?:购|助|一个|一下|个)?(?:[A-Za-z0-9._-]{0,16}|团队|管理员|家庭|企业|共享|朋友|个人|学生|开发者|机场)?[\s:：]*(?:优惠码|会员|账号|主机|路由器|套餐|商品|上车|自建)/;

/**
 * Second-hand trade posts ("200 出 xx", "+50 收 xx", "【出】…", "清机出 …").
 * They quote prices and discounts but are one person selling to another, not an offer.
 * 出/收 only count right after a bracket, a price, or at the very start, so 推出/出现/收到 do not match.
 */
const TRADE =
  /(?:^|[【\[])\s*(?:出|收)\s*(?:[】\]]|\s|\d|个|一|台|张|几)|(?:^|[\s+＋【\[])\d+(?:\.\d+)?\s*(?:元|块|刀|[rRuU¥$])?\s*(?:出|收)(?![现来去入到集藏获录费益购])|清机出|(?:总价|打包|溢价|原价|平价|折价)\s*\d*\s*(?:元|刀|[rRuU])?\s*(?:出|收)|车找人|人找车|拼车|合租/;

const QUESTION = /有没有|有无|是否|请问|能不能|可不可以|为什么|为啥|怎么|如何|有什么|什么价|是啥|哪里有|哪个好|吗\s*[?？]|吗\s*$/;

/**
 * Signals compete; punctuation and update notices are not unconditional vetoes.
 * This is a display heuristic over titles only. It never asserts that an offer is real,
 * still valid, or claimable.
 */
export function classifySignals(title: string, sourceId: string): Classification {
  if (sourceId === "epic") return { category: "游戏", contentType: "deal", confidence: "high", score: 10 };
  const strong = STRONG.test(title);
  const medium = MEDIUM.test(title);
  const membership = /会员|订阅|套餐/.test(title);
  const game = token(title, "epic") || token(title, "steam") || /游戏|喜加一/.test(title);
  const hardNoise = /抽奖|开奖|抽取|求购|收购|求助/.test(title) || REQUEST.test(title);
  const trade = TRADE.test(title);
  const editorial = /闲聊|讨论|新闻|资讯|评测|测评|避雷|吐槽|预测/.test(title);
  const question = QUESTION.test(title);
  const score =
    (strong ? 5 : medium ? 3 : membership || game ? 2 : 0) -
    (hardNoise ? 10 : 0) -
    (trade ? 6 : 0) -
    (editorial ? 5 : 0) -
    (question ? 4 : 0) -
    (/[?？]/.test(title) && !strong ? 1 : 0);

  let category: Category = "其他";
  if (score >= 2) {
    if (game) category = "游戏";
    else if (membership) category = "会员订阅";
    else if (/限免|免费领/.test(title)) category = "限免";
    else if (FREEBIE.test(title)) category = "免费白嫖";
    else category = "低价优惠";
  }
  return {
    category,
    contentType: category !== "其他" ? "deal" : hardNoise || trade || editorial || question ? "discussion" : "uncertain",
    confidence: score >= 5 ? "high" : score >= 2 ? "medium" : "low",
    score,
  };
}

export function classify(title: string, sourceId: string): Category {
  return classifySignals(title, sourceId).category;
}
