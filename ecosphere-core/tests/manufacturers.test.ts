import { describe, it, expect } from "vitest";
import { detectManufacturer } from "@/lib/manufacturers";

describe("detectManufacturer", () => {
  it("detects known brands from the name", () => {
    expect(detectManufacturer("VAILLANT AROTHERM PLUS 7KW")).toBe("Vaillant");
    expect(detectManufacturer("DAIKIN EDLA08EV3 MONO ASHP")).toBe("Daikin");
    expect(detectManufacturer("GRANT AERONA 290 9KW")).toBe("Grant");
    expect(detectManufacturer("FOX ESS 12KWH EP12-H BATTERY")).toBe("Fox ESS");
    expect(detectManufacturer("DAIK SB.EKHWSU200 UNVENT CYL")).toBe("Daikin");
  });
  it("returns null for generic / empty", () => {
    expect(detectManufacturer("15mm copper pipe")).toBeNull();
    expect(detectManufacturer("Lockshield valve")).toBeNull();
    expect(detectManufacturer("")).toBeNull();
  });
});
