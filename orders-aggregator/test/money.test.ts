import { describe, expect, it } from "vitest";
import { fromKop, parseRub, toKop } from "../src/utils/money.js";

describe("parseRub", () => {
  it("принимает число и строку с числом", () => {
    expect(parseRub(2500)).toBe(2500);
    expect(parseRub("2500.00")).toBe(2500);
    expect(parseRub(" 99 ")).toBe(99);
  });

  it("отклоняет мусор и отрицательные суммы", () => {
    expect(() => parseRub("abc")).toThrow();
    expect(() => parseRub(null)).toThrow();
    expect(() => parseRub(-1)).toThrow();
    expect(() => parseRub("")).toThrow();
    expect(() => parseRub("   ")).toThrow();
  });
});

describe("toKop / fromKop", () => {
  it("рубли в копейки", () => {
    expect(toKop(2500)).toBe(250000);
    expect(toKop(99)).toBe(9900);
  });

  it("отбрасывает доли копейки", () => {
    expect(toKop(10.999)).toBe(1099);
  });

  it.each([[1.13, 113], [4.56, 456], [19.99, 1999], [0.29, 29], [1.01, 101]])(
    "не теряет копейку при переводе %s рублей",
    (rub, kop) => expect(toKop(rub)).toBe(kop),
  );

  it("поддерживает экспоненциальную запись и отклоняет небезопасные суммы", () => {
    expect(toKop(1e-7)).toBe(0);
    expect(toKop(1e12)).toBe(100_000_000_000_000);
    expect(() => toKop(Number.MAX_SAFE_INTEGER)).toThrow();
  });

  it("копейки в рубли", () => {
    expect(fromKop(250000)).toBe(2500);
    expect(fromKop(1099)).toBe(10.99);
  });
});
