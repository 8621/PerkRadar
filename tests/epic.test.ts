import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { parseEpicFreeGames } from "../src/lib/parse/epic";
import { formatBeijing } from "../src/lib/time";

const sample = JSON.parse(
  fs.readFileSync(new URL("./fixtures/epic-public-sample.json", import.meta.url), "utf8"),
) as unknown;

const NOW = Date.parse("2026-11-08T06:00:00.000Z");

describe("Epic current free games", () => {
  it("keeps only in-window free promotions from the captured catalog", () => {
    const items = parseEpicFreeGames(sample, NOW);
    const titles = items.map((item) => item.title).sort();
    assert.deepEqual(titles, ["《Idle Champions of the Forgotten Realms》", "浮游世界"]);
    const flotsam = items.find((item) => item.title === "浮游世界");
    assert.equal(flotsam?.url, "https://store.epicgames.com/zh-CN/p/flotsam-266287");
    assert.equal(flotsam?.expiresAt, Date.parse("2026-11-12T16:00:00.000Z"));
    assert.equal(formatBeijing(flotsam!.expiresAt!), "2026-11-13 00:00");
    assert.ok(flotsam!.summary.length > 0);
  });

  it("excludes a SYNTHETIC offer that is upcoming, paid, or already ended", () => {
    const payload = {
      data: {
        Catalog: {
          searchStore: {
            elements: [
              {
                title: "SYNTHETIC upcoming",
                productSlug: "synthetic-upcoming",
                price: { totalPrice: { discountPrice: 0 } },
                promotions: {
                  promotionalOffers: [],
                  upcomingPromotionalOffers: [
                    {
                      promotionalOffers: [
                        {
                          startDate: "2026-11-20T00:00:00.000Z",
                          endDate: "2026-11-27T00:00:00.000Z",
                          discountSetting: { discountPercentage: 0 },
                        },
                      ],
                    },
                  ],
                },
              },
              {
                title: "SYNTHETIC paid",
                productSlug: "synthetic-paid",
                price: { totalPrice: { discountPrice: 100 } },
                promotions: {
                  promotionalOffers: [
                    {
                      promotionalOffers: [
                        {
                          startDate: "2026-11-01T00:00:00.000Z",
                          endDate: "2026-11-20T00:00:00.000Z",
                          discountSetting: { discountPercentage: 50 },
                        },
                      ],
                    },
                  ],
                },
              },
              {
                title: "SYNTHETIC ended",
                productSlug: "synthetic-ended",
                price: { totalPrice: { discountPrice: 0 } },
                promotions: {
                  promotionalOffers: [
                    {
                      promotionalOffers: [
                        {
                          startDate: "2026-11-01T00:00:00.000Z",
                          endDate: "2026-11-08T06:00:00.000Z",
                          discountSetting: { discountPercentage: 0 },
                        },
                      ],
                    },
                  ],
                },
              },
              {
                title: "SYNTHETIC starts now",
                productSlug: "synthetic-start",
                price: { totalPrice: { discountPrice: 0 } },
                promotions: {
                  promotionalOffers: [
                    {
                      promotionalOffers: [
                        {
                          startDate: "2026-11-08T06:00:00.000Z",
                          endDate: "2026-11-09T06:00:00.000Z",
                          discountSetting: { discountPercentage: 0 },
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    };
    const items = parseEpicFreeGames(payload, NOW);
    assert.deepEqual(
      items.map((item) => item.title),
      ["SYNTHETIC starts now"],
    );
  });
});
