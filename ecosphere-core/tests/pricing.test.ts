import { describe, it, expect } from "vitest";
import { sellPrice, markupForMargin, marginForMarkup } from "@/lib/pricing";

describe("sellPrice", () => {
  it("applies markup and rounds to 2dp", () => {
    expect(sellPrice(100, 20)).toBe(120);
    expect(sellPrice(61.41, 0)).toBe(61.41);
    expect(sellPrice(5.16, 42.9)).toBeCloseTo(7.37, 2);
  });
});

describe("markupForMargin / marginForMarkup", () => {
  it("30% margin needs ~42.9% markup", () => {
    expect(markupForMargin(30)).toBeCloseTo(42.9, 1);
  });
  it("known points", () => {
    expect(markupForMargin(0)).toBe(0);
    expect(markupForMargin(50)).toBe(100);
    expect(marginForMarkup(100)).toBe(50);
    expect(marginForMarkup(0)).toBe(0);
  });
  it("caps near 100% margin (no blow-up)", () => {
    expect(markupForMargin(95)).toBe(1900);
    expect(markupForMargin(99)).toBe(1900);
  });
});
