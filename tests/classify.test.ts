import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classify } from "../src/lib/classify";

describe("classify", () => {
  it("puts Epic source and game keywords ahead of membership words", () => {
    assert.equal(classify("会员订阅年卡", "epic"), "游戏");
    assert.equal(classify("Epic 免费领取", "linuxdo"), "游戏");
    assert.equal(classify("steam98%好评游戏喜加一", "v2ex"), "游戏");
    assert.equal(classify("Steam Pro 会员", "v2ex"), "游戏");
  });

  it("matches Pro on a letter boundary and ignores Professional or Product", () => {
    assert.equal(classify("ChatGPT Pro 套餐", "appinn"), "会员订阅");
    assert.equal(classify("PRO版限免", "appinn"), "会员订阅");
    assert.equal(classify("Professional toolbox", "appinn"), "其他");
    assert.equal(classify("Product Hunt 周报", "appinn"), "其他");
    assert.equal(classify("iProvide notes", "appinn"), "其他");
  });

  it("follows the documented keyword order", () => {
    assert.equal(classify("免费领取会员", "linuxdo"), "会员订阅");
    assert.equal(classify("本周限免", "linuxdo"), "限免");
    assert.equal(classify("免费领取三个月", "linuxdo"), "限免");
    assert.equal(classify("白嫖一年", "linuxdo"), "免费白嫖");
    assert.equal(classify("完全免费", "linuxdo"), "免费白嫖");
    assert.equal(classify("大促折扣码", "linuxdo"), "低价优惠");
    assert.equal(classify("优惠码在此", "linuxdo"), "低价优惠");
    assert.equal(classify("年卡打折", "iplaysoft"), "低价优惠");
    assert.equal(classify("降价通知", "ghxi"), "低价优惠");
    assert.equal(classify("正版软件爆降", "iplaysoft"), "低价优惠");
    assert.equal(classify("x10hosting 永免虚拟主机", "linuxdo"), "免费白嫖");
    assert.equal(classify("软件更新公告", "appinn"), "其他");
  });
});
