// Best-effort manufacturer detection from a product name. Mirrors the one-off
// catalogue backfill rules. Used to PRE-FILL the manufacturer field on a new
// product — always editable, so a wrong guess is a one-keystroke fix.
export function detectManufacturer(name: string): string | null {
  const n = (name || "").toUpperCase();
  const has = (...subs: string[]) => subs.some((s) => n.includes(s));
  if (has("VAILLANT", "AROTHERM", "AROSTOR", "UNISTOR", "UNITOWER") || /^VAIL/.test(n) || /^VAINSUL/.test(n) || /^VA[ .]/.test(n)) return "Vaillant";
  if (has("DAIKIN", "ALTHERMA", "MADOKA", "ERLQ") || /^DAIK/.test(n) || /^DAI /.test(n) || /^ASW /.test(n)) return "Daikin";
  if (has("GRANT", "AERONA")) return "Grant";
  if (has("MITSUBISHI", "ECODAN")) return "Mitsubishi";
  if (has("FOX ESS") || /^FOX /.test(n)) return "Fox ESS";
  if (has("HIVE")) return "Hive";
  if (has("INTAKLEAN")) return "Intaklean";
  return null;
}
