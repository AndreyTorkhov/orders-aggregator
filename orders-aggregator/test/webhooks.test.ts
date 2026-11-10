import { describe, expect, it } from "vitest";
import { apiOrder, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("POST /webhooks/order", () => {
  it("создаёт заказ", async () => {
    const res = await postWebhook(ctx.app, apiOrder());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result: "created" });
  });

  it("повтор того же события ничего не меняет", async () => {
    const o = apiOrder();
    await postWebhook(ctx.app, o);
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
  });

  it("устаревшее событие после нового игнорируется", async () => {
    const o = apiOrder({ status: "paid", updatedAt: "2026-02-10T12:00:00Z" });
    await postWebhook(ctx.app, { ...o, status: "refunded", updatedAt: "2026-02-11T12:00:00Z" });
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
    const { rows } = await ctx.db.query(`SELECT status FROM orders WHERE id = $1`, [o.id]);
    expect(rows[0].status).toBe("refunded");
  });

  it("новое событие обновляет заказ", async () => {
    const o = apiOrder({ status: "pending" });
    await postWebhook(ctx.app, o);
    const res = await postWebhook(ctx.app, { ...o, status: "paid", updatedAt: "2026-02-11T00:00:00Z" });
    expect(res.json()).toEqual({ result: "updated" });
  });

  it("невалидное тело — 400", async () => {
    const res = await postWebhook(ctx.app, { id: "x" });
    expect(res.statusCode).toBe(400);
  });

  it("обновляет фактическую оплату и не откатывает её повтором или старой версией", async () => {
    const o = apiOrder({ amount: 100, amountPaid: 90 });
    await postWebhook(ctx.app, o);
    const fresh = { ...o, amountPaid: 80, updatedAt: "2026-02-11T00:00:00Z" };
    expect((await postWebhook(ctx.app, fresh)).json()).toEqual({ result: "updated" });
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
    expect((await postWebhook(ctx.app, fresh)).json()).toEqual({ result: "stale" });
    const { rows } = await ctx.db.query(`SELECT amount_paid_kop FROM orders WHERE id = $1`, [o.id]);
    expect(Number(rows[0].amount_paid_kop)).toBe(8000);
  });

  it.each([-1, "abc", null, "", 1001])("отклоняет невалидную фактическую оплату %s", async (amountPaid) => {
    const o = apiOrder({ amountPaid });
    expect((await postWebhook(ctx.app, o)).statusCode).toBe(400);
    expect(await ctx.container.orders.apply(apiOrder({ id: o.id }))).toBe("created");
  });
});
