import { describe, it, expect } from "vitest";
import { mergeAssumptions, estimateLabour, DEFAULT_ASSUMPTIONS } from "@/lib/standingAssumptions";

describe("mergeAssumptions", () => {
  it("returns defaults for null/garbage", () => {
    expect(mergeAssumptions(null)).toEqual(DEFAULT_ASSUMPTIONS);
    expect(mergeAssumptions("nope" as any)).toEqual(DEFAULT_ASSUMPTIONS);
  });
  it("merges a partial labour override, keeping other defaults", () => {
    const a = mergeAssumptions({ labour: { day_rate: 400 } });
    expect(a.labour.day_rate).toBe(400);
    expect(a.labour.ashp_base_days).toBe(DEFAULT_ASSUMPTIONS.labour.ashp_base_days);
  });
  it("deep-merges the cylinder map", () => {
    const a = mergeAssumptions({ cylinder_litres_by_bedrooms: { 3: 999 } });
    expect(a.cylinder_litres_by_bedrooms[3]).toBe(999);
    expect(a.cylinder_litres_by_bedrooms[4]).toBe(DEFAULT_ASSUMPTIONS.cylinder_litres_by_bedrooms[4]);
  });
});

describe("estimateLabour", () => {
  it("ASHP base + commissioning + per-radiator", () => {
    const r = estimateLabour({ hasHeatPump: true, radiatorCount: 5 });
    expect(r.days).toBe(6); // 3 base + 1 commissioning + 5*0.4
    expect(r.day_rate).toBe(DEFAULT_ASSUMPTIONS.labour.day_rate);
  });
  it("honours overridden day rate", () => {
    const r = estimateLabour({ hasHeatPump: true }, mergeAssumptions({ labour: { day_rate: 500 } }));
    expect(r.day_rate).toBe(500);
  });
  it("zero work -> zero days", () => {
    expect(estimateLabour({}).days).toBe(0);
  });
});
