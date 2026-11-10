import { afterEach, describe, expect, it, vi } from "vitest";
import { apiOrder, dailyTotals, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

afterEach(() => vi.useRealTimers());

describe("GET /customers/:id/daily-totals", () => {
  it("суммирует оплаченные заказы по дням в таймзоне клиента", async () => {
    // c_1 — Europe/Moscow (UTC+3): 20:30Z ещё 10-е, 21:30Z уже 11-е
    await postWebhook(ctx.app, apiOrder({ amount: 1000, createdAt: "2026-02-10T20:30:00Z" }));
    await postWebhook(ctx.app, apiOrder({ amount: 250, createdAt: "2026-02-10T21:30:00Z" }));
    await postWebhook(ctx.app, apiOrder({ amount: "99", createdAt: "2026-02-11T10:00:00Z" }));

    const res = await dailyTotals(ctx.app, "c_1", "2026-02-09", "2026-02-11");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { date: "2026-02-09", total: 0, gross: 0, discount: 0, net: 0 },
      { date: "2026-02-10", total: 1000, gross: 1000, discount: 0, net: 1000 },
      { date: "2026-02-11", total: 349, gross: 349, discount: 0, net: 349 },
    ]);
  });

  it("не учитывает pending и refunded", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 500 }));
    await postWebhook(ctx.app, apiOrder({ amount: 700, status: "pending" }));
    await postWebhook(ctx.app, apiOrder({ amount: 900, status: "refunded" }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 500, gross: 500, discount: 0, net: 500 }]);
  });

  it("учитывает только заказы этого клиента", async () => {
    ctx.api.customers.set("c_2", "Asia/Novosibirsk");
    await postWebhook(ctx.app, apiOrder({ amount: 500 }));
    await postWebhook(ctx.app, apiOrder({ amount: 800, customerId: "c_2" }));
    const res = await dailyTotals(ctx.app, "c_2", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 800, gross: 800, discount: 0, net: 800 }]);
  });

  it("считает скидки по фактической оплате, включая строки, копейки и полную скидку", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 2500, discountPercent: 16.5, amountPaid: "2087.50" }));
    await postWebhook(ctx.app, apiOrder({ amount: 100, discountPercent: 10, amountPaid: 99.99 }));
    await postWebhook(ctx.app, apiOrder({ amount: "1.13", amountPaid: "1.01" }));
    await postWebhook(ctx.app, apiOrder({ amount: 10, discountPercent: 100, amountPaid: 0 }));
    await postWebhook(ctx.app, apiOrder({ amount: 50 }));
    await postWebhook(ctx.app, apiOrder({ amount: 100, amountPaid: 70, status: "refunded" }));
    await postWebhook(ctx.app, apiOrder({ amount: 100, amountPaid: 70, status: "pending" }));

    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([
      { date: "2026-02-10", total: 2661.13, gross: 2661.13, discount: 422.63, net: 2238.5 },
    ]);
  });

  it.each(["2026-01-15T12:00:00Z", "2026-07-15T12:00:00Z"])(
    "учитывает переход DST и границы периода независимо от текущей даты %s",
    async (now) => {
      ctx.api.customers.set("c_7", "Europe/Berlin");
      const orderList = [
        ["2026-03-26T22:59:59Z", 1000],
        ["2026-03-26T23:00:00Z", 1],
        ["2026-03-27T22:30:00Z", 10],
        ["2026-03-28T22:30:00Z", 20],
        ["2026-03-28T23:30:00Z", 30],
        ["2026-03-29T00:59:59Z", 40],
        ["2026-03-29T01:00:00Z", 50],
        ["2026-03-29T22:30:00Z", 60],
        ["2026-03-30T22:30:00Z", 70],
        ["2026-03-31T22:00:00Z", 1000],
      ] as const;
      for (const [createdAt, amount] of orderList) {
        expect((await postWebhook(ctx.app, apiOrder({ customerId: "c_7", createdAt, amount }))).statusCode).toBe(200);
      }

      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(now));
      const res = await dailyTotals(ctx.app, "c_7", "2026-03-27", "2026-03-31");
      expect(res.json()).toEqual([
        { date: "2026-03-27", total: 11, gross: 11, discount: 0, net: 11 },
        { date: "2026-03-28", total: 20, gross: 20, discount: 0, net: 20 },
        { date: "2026-03-29", total: 120, gross: 120, discount: 0, net: 120 },
        { date: "2026-03-30", total: 60, gross: 60, discount: 0, net: 60 },
        { date: "2026-03-31", total: 70, gross: 70, discount: 0, net: 70 },
      ]);
    },
  );

  it("учитывает повторяющийся час при осеннем переходе DST", async () => {
    ctx.api.customers.set("c_7", "Europe/Berlin");
    await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 10, createdAt: "2026-10-25T00:30:00Z" }));
    await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 20, createdAt: "2026-10-25T01:30:00Z" }));
    await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 40, createdAt: "2026-10-25T22:30:00Z" }));
    const res = await dailyTotals(ctx.app, "c_7", "2026-10-25", "2026-10-25");
    expect(res.json()).toEqual([{ date: "2026-10-25", total: 70, gross: 70, discount: 0, net: 70 }]);
  });

  it("таймзона клиента берётся из API один раз", async () => {
    await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    ctx.api.customers.set("c_1", "UTC");
    await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    const { rows } = await ctx.db.query(`SELECT timezone FROM customers WHERE id = 'c_1'`);
    expect(rows[0].timezone).toBe("Europe/Moscow");
  });

  it("валидирует даты", async () => {
    expect((await dailyTotals(ctx.app, "c_1", "2026-02-30", "2026-03-01")).statusCode).toBe(400);
    expect((await dailyTotals(ctx.app, "c_1", "2026-03-02", "2026-03-01")).statusCode).toBe(400);
  });

  it("неизвестный клиент — 404", async () => {
    const res = await dailyTotals(ctx.app, "nobody", "2026-02-10", "2026-02-10");
    expect(res.statusCode).toBe(404);
  });
});
