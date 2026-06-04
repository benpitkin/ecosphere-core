// Customer-facing proposal content: company block (single source of truth — white-label),
// scope-of-works, compliance/protection blocks, and helpers to group lines + derive the
// "at a glance" hero. Lean + MCS/RECC-compliant. See docs/PROPOSAL-BLUEPRINT.
import type { ProductCategory } from "@/lib/proposal";

export const COMPANY = {
  name: "EcoSphere Energy Ltd",
  tagline: "MCS-accredited renewable installer · Devon",
  address: "2 Tyrrell Road, Tiverton, Devon EX16 5BB",
  phone: "07867 433135",
  email: "info@ecosphereenergy.co.uk",
  web: "ecosphereenergy.co.uk",
  companyNo: "13933148",
  vatNo: "405090531",
  workmanshipWarrantyYears: 2,
};

// ---- Customer-facing line grouping --------------------------------------------
// Headline groups shown as their own cards; the rest collapse into one tidy line.
export type CustomerGroupKey =
  | "heat_pump" | "cylinder" | "radiators" | "solar" | "inverter" | "battery"
  | "materials" | "labour" | "other";

export const CUSTOMER_GROUP_LABELS: Record<CustomerGroupKey, string> = {
  heat_pump: "Heat pump",
  cylinder: "Hot water cylinder",
  radiators: "Radiators & emitters",
  solar: "Solar panels",
  inverter: "Inverter",
  battery: "Battery storage",
  materials: "Mounting, cabling & electrical",
  labour: "Installation & labour",
  other: "Other items",
};

// Display order of groups in the customer proposal.
export const CUSTOMER_GROUP_ORDER: CustomerGroupKey[] = [
  "heat_pump", "cylinder", "radiators", "solar", "inverter", "battery", "materials", "labour", "other",
];

// Which groups are presented as individual "headline" component cards (vs collapsed).
export const HEADLINE_GROUPS: CustomerGroupKey[] = [
  "heat_pump", "cylinder", "radiators", "solar", "inverter", "battery",
];

// Map a product category to its customer-facing group.
export function groupForCategory(cat: ProductCategory | null): CustomerGroupKey {
  switch (cat) {
    case "heat_pump": return "heat_pump";
    case "cylinder": return "cylinder";
    case "radiator": case "emitter": return "radiators";
    case "solar_panel": return "solar";
    case "inverter": return "inverter";
    case "battery": return "battery";
    case "pipe": case "fitting": case "valve": case "control":
    case "electrical": case "consumable": case "mounting": return "materials";
    case "labour": return "labour";
    default: return "other";
  }
}

// Format known product attributes into short spec chips for component cards.
export function specChips(attrs: Record<string, any> | null | undefined): string[] {
  if (!attrs) return [];
  const out: string[] = [];
  if (attrs.kw != null) out.push(`${attrs.kw} kW`);
  if (attrs.kwp != null) out.push(`${attrs.kwp} kWp`);
  if (attrs.kwh != null) out.push(`${attrs.kwh} kWh`);
  if (attrs.litres != null) out.push(`${attrs.litres} L`);
  if (attrs.output_w != null) out.push(`${attrs.output_w} W`);
  if (attrs.scop != null) out.push(`SCOP ${attrs.scop}`);
  if (attrs.type != null) out.push(String(attrs.type));
  if (attrs.warranty_years != null) out.push(`${attrs.warranty_years} yr warranty`);
  return out;
}

// ---- Scope of works (trimmed, per domain) -------------------------------------
export const SCOPE_ASHP = [
  "Design of your heating system from a room-by-room heat loss survey (BS EN 12831)",
  "Supply and installation of the heat pump, hot water cylinder and controls",
  "Replacement and upgrade of radiators and pipework as per the design",
  "Electrical connection, system flush, pressure test and full commissioning",
  "Decommissioning and removal of your existing heating appliance",
  "Customer handover, MCS certificate and Boiler Upgrade Scheme grant administration",
];
export const SCOPE_SOLAR = [
  "Design and installation of a complete solar PV system to MCS standards",
  "Supply and fit of panels, inverter, isolators, mounting system and cabling",
  "Battery storage installation and integration (where included)",
  "Integration with your consumer unit and generation metering",
  "Testing, commissioning and MCS handover documentation",
  "DNO (G98/G99) notification and Smart Export Guarantee advice",
];

// ---- Compliance & consumer protection (fixed block) ---------------------------
// Carries the RECC + MCS must-haves identified in the blueprint.
export const COMPLIANCE_BLOCKS: { heading: string; body: string }[] = [
  { heading: "MCS & RECC standards",
    body: "Your system is designed, installed and commissioned to MCS standards (MIS 3002 for solar PV, MIS 3005 for heat pumps) and we work to the RECC Consumer Code. You will receive your MCS certificate within 10 working days of commissioning, with a full handover pack." },
  { heading: "Your money is protected",
    body: "Your deposit and our workmanship warranty are insurance-backed through an RECC-approved scheme, protecting your payments and the warranty should the unforeseen happen." },
  { heading: "Your right to cancel",
    body: "You have a 14-day cooling-off period from acceptance and a cancellation form is included. Where this proposal precedes a full technical survey, the performance and sizing figures are estimates and may change after the visit — if they do, you may cancel with no penalty." },
  { heading: "Warranties",
    body: `A ${COMPANY.workmanshipWarrantyYears}-year workmanship warranty is included; manufacturer warranties typically range from 5 to 12 years depending on the equipment.` },
  { heading: "Notifications & grant",
    body: "The installation is notified to Building Control; solar systems are notified to your DNO. We administer your Boiler Upgrade Scheme grant directly with Ofgem and the deduction is already shown in your quote." },
  { heading: "If something isn't right",
    body: "Please contact us first and we'll put it right. Any matter we can't resolve together can be referred to RECC's independent alternative dispute resolution service." },
];

// ---- Part images: per-product photo (attrs.image_url) over a bundled category illustration
export const GROUP_IMAGE: Record<CustomerGroupKey, string> = {
  heat_pump: "/proposal/heat_pump.svg",
  cylinder: "/proposal/cylinder.svg",
  radiators: "/proposal/radiator.svg",
  solar: "/proposal/solar_panel.svg",
  inverter: "/proposal/inverter.svg",
  battery: "/proposal/battery.svg",
  materials: "/proposal/materials.svg",
  labour: "/proposal/labour.svg",
  other: "/proposal/other.svg",
};
export function lineImage(attrs: Record<string, any> | null | undefined, group: CustomerGroupKey): string {
  const u = attrs?.image_url;
  return typeof u === "string" && u.length > 0 ? u : GROUP_IMAGE[group];
}
