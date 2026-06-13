import { describe, it, expect } from "vitest";
import { linesFromPayload, mergeSignals, type ResolveContext } from "@/lib/proposalResolve";

const ctx = (products: any[] = [], rules: any[] = [], margins: any[] = [], tplItems: any[] = []): ResolveContext =>
  ({ products, rules, margins, tplItems });

describe("linesFromPayload — heat loss", () => {
  it("matches a heat pump exactly by mfr_code", () => {
    const products = [{ id: "hp1", name: "Daikin EDLA08", category: "heat_pump", unit: "each", cost_price: 2000, vat_rate: 20, attrs: { mfr_code: "EDLA08EV3", kind: "outdoor", kw: 8 } }];
    const rules = [{ type: "direct", trigger_key: "heat_pump", target_category: "heat_pump", qty_per: 1 }];
    const payload = { source: "spruce_heatloss", heat_loss: { total_kw: 8 }, heat_pump: { model_number: "EDLA08EV3", kw: 8, label: "Daikin EDLA08" } };
    const { lines, signals } = linesFromPayload(payload, ctx(products, rules));
    expect(signals.hasHeatPump).toBe(true);
    const hp = lines.find((l) => l.category === "heat_pump");
    expect(hp?.product_id).toBe("hp1");
    expect(hp?.needs_sku).toBe(false);
    expect(hp?.unit_cost).toBe(2000);
  });

  it("emits a needs-SKU placeholder when nothing matches", () => {
    const rules = [{ type: "direct", trigger_key: "heat_pump", target_category: "heat_pump", qty_per: 1 }];
    const payload = { source: "spruce_heatloss", heat_pump: { model_number: "ZZZ999", label: "Unknown unit" } };
    const { lines } = linesFromPayload(payload, ctx([], rules));
    const hp = lines.find((l) => l.category === "heat_pump");
    expect(hp?.product_id).toBeNull();
    expect(hp?.needs_sku).toBe(true);
  });

  it("seeds base-kit items from the template", () => {
    const tplItems = [{ template_id: "base", qty: 2, products: { id: "x", name: "Consumable", category: "consumable", unit: "each", cost_price: 5, vat_rate: 20, attrs: {} } }];
    const rules = [{ type: "base_kit", bundle_template_id: "base" }];
    const payload = { source: "spruce_heatloss", heat_loss: {} };
    const { lines } = linesFromPayload(payload, ctx([], rules, [], tplItems));
    expect(lines.some((l) => l.source === "base_kit" && l.product_id === "x")).toBe(true);
  });
});

describe("mergeSignals", () => {
  it("ORs flags and sums counts across payloads", () => {
    const m = mergeSignals([
      { radiatorCount: 2, hasHeatPump: true, hasCylinder: false, hasSolar: false, panelCount: 0, hasBattery: false, hasInverter: false },
      { radiatorCount: 3, hasHeatPump: false, hasCylinder: true, hasSolar: true, panelCount: 8, hasBattery: false, hasInverter: false },
    ]);
    expect(m.radiatorCount).toBe(5);
    expect(m.hasHeatPump).toBe(true);
    expect(m.hasCylinder).toBe(true);
    expect(m.panelCount).toBe(8);
  });
});
