/**
 * Деньги внутри сервиса — целые копейки. Рубли — только на входе (внешний API) и в ответах.
 */

/** Сумма из внешнего API: число или строка с числом ("250.10"). */
export function parseRub(raw: unknown): number {
  if (typeof raw === "string" && raw.trim() === "") {
    throw new Error("invalid amount: empty string");
  }
  const value = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`invalid amount: ${JSON.stringify(raw)}`);
  }
  return value;
}

/** Рубли → копейки. Доли копейки отбрасываются: деньги клиенту не досчитываем. */
export function toKop(rub: number): number {
  const [mantissa, exponent = "0"] = rub.toString().split("e");
  const kop = Math.floor(Number(`${mantissa}e${Number(exponent) + 2}`));
  if (!Number.isSafeInteger(kop) || kop < 0) {
    throw new Error("amount is outside the safe integer range in kopecks");
  }
  return kop;
}

/** Копейки → рубли для ответа API. */
export function fromKop(kop: number): number {
  return kop / 100;
}
