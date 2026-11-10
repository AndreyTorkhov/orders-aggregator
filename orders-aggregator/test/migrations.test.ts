import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

it("миграция сохраняет старые заказы и заполняет оплату суммой без скидки", async () => {
  const client = await ctx.db.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE SCHEMA migration_test");
    await client.query("SET LOCAL search_path TO migration_test");
    await client.query(await readFile(new URL("../migrations/001_init.sql", import.meta.url), "utf8"));
    await client.query(
      `INSERT INTO orders (id, customer_id, amount_kop, status, created_at, updated_at)
       VALUES ('old', 'c_1', 12345, 'paid', now(), now())`,
    );
    await client.query(await readFile(new URL("../migrations/002_amount_paid.sql", import.meta.url), "utf8"));
    const { rows } = await client.query(`SELECT id, amount_kop, amount_paid_kop, status FROM orders`);
    expect(rows).toEqual([{ id: "old", amount_kop: "12345", amount_paid_kop: "12345", status: "paid" }]);
    await expect(client.query(`UPDATE orders SET amount_paid_kop = NULL`)).rejects.toMatchObject({ code: "23502" });
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
