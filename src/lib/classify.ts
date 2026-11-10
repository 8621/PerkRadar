import type { Category } from "./types";

export type Classification = { category: Category; contentType: "deal" | "discussion" | "uncertain"; confidence: "high" | "medium" | "low"; score: number };
function token(title: string, word: string): boolean {
  return new RegExp(`(?:^|[^A-Za-z])${word}(?:[^A-Za-z]|$)`, "i").test(title);
}
/** Signals compete; punctuation and update notices are not unconditional vetoes. */
export function classifySignals(title: string, sourceId: string): Classification {
  if (sourceId === "epic") return { category: "游戏", contentType: "deal", confidence: "high", score: 10 };
  const strong = /限免|免费领取|优惠码|大促|降价|打折|爆降|折扣|永免|白嫖/.test(title);
  const free = /免费/.test(title);
  const membership = /会员|订阅|套餐/.test(title);
  const game = token(title, "epic") || token(title, "steam") || /游戏|喜加一/.test(title);
  const request = /(?:^|[\s【\[])(?:收|求)(?:购|助|一个|一下|个)?(?:[A-Za-z0-9._-]{0,16}|团队|管理员|家庭|企业|共享|朋友|个人|学生|开发者|机场)?[\s:：]*(?:优惠码|会员|账号|主机|路由器|套餐|商品|上车|自建)/.test(title);
  const hardNoise = /抽奖|开奖|抽取|求购|收购|求助/.test(title) || request;
  const editorial = /闲聊|讨论|新闻|资讯|评测|测评|避雷|吐槽|预测/.test(title);
  const question = /有没有|有无|是否|请问|是真的吗|能不能|可不可以/.test(title);
  const score = (strong ? 5 : free ? 3 : membership || game ? 2 : 0) - (hardNoise ? 10 : 0) - (editorial ? 5 : 0) - (question ? 3 : 0) - (/[?？]/.test(title) && !strong ? 1 : 0);
  let category: Category = "其他";
  if (score >= 2) {
    if (game) category = "游戏";
    else if (membership) category = "会员订阅";
    else if (/限免|免费领取/.test(title)) category = "限免";
    else if (/白嫖|免费|永免/.test(title)) category = "免费白嫖";
    else if (strong) category = "低价优惠";
  }
  return { category, contentType: category !== "其他" ? "deal" : hardNoise || editorial || question ? "discussion" : "uncertain", confidence: score >= 5 ? "high" : score >= 2 ? "medium" : "low", score };
}
export function classify(title: string, sourceId: string): Category {
  return classifySignals(title, sourceId).category;
}
