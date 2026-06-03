// Proposal Engine domain types + label/colour maps (Hub module).

export type ProductCategory =
  | "heat_pump" | "cylinder" | "radiator" | "emitter" | "pipe" | "fitting" | "valve"
  | "control" | "electrical" | "consumable" | "solar_panel" | "inverter" | "battery"
  | "mounting" | "labour" | "other";

export type LineSource = "design" | "rule" | "base_kit" | "manual";
export type ProposalStatus = "draft" | "ready" | "sent" | "accepted" | "rejected" | "expired";
export type PoStatus = "draft" | "sent" | "confirmed" | "received" | "cancelled";
export type PoType = "supplier" | "subcontractor";
export type MappingType = "direct" | "schedule" | "base_kit";

export interface Supplier {
  id: string;
  name: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
}

export interface Product {
  id: string;
  sku: string | null;
  name: string;
  category: ProductCategory;
  supplier_id: string | null;
  unit: string;
  cost_price: number;
  vat_rate: number;
  attrs: Record<string, any>;
  active: boolean;
}

export interface MarginRule {
  id: string;
  category: ProductCategory | null; // null = global default
  markup_pct: number;
}

export interface KitTemplate {
  id: string;
  key: string;
  name: string;
  notes: string | null;
}

export interface MappingRule {
  id: string;
  type: MappingType;
  trigger_key: string | null;
  target_category: ProductCategory | null;
  match_attrs: Record<string, any>;
  product_id: string | null;
  qty_per: number;
  bundle_template_id: string | null;
  active: boolean;
  notes: string | null;
}

export interface DesignInput {
  id: string;
  deal_id: string | null;
  source: string;
  payload: Record<string, any>;
  created_at: string;
}

export interface Proposal {
  id: string;
  deal_id: string | null;
  design_input_id: string | null;
  title: string;
  status: ProposalStatus;
  bus_grant: number;
  version: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProposalLine {
  id: number;
  proposal_id: string;
  product_id: string | null;
  description: string;
  category: ProductCategory | null;
  qty: number;
  unit: string;
  unit_cost: number;
  markup_pct: number;
  unit_sell: number; // generated = round(unit_cost * (1 + markup_pct/100), 2)
  vat_rate: number;
  source: LineSource;
  needs_sku: boolean;
  sort: number;
}

export interface PurchaseOrder {
  id: string;
  proposal_id: string | null;
  supplier_id: string | null;
  type: PoType;
  status: PoStatus;
  reference: string | null;
}

export interface PoLine {
  id: number;
  po_id: string;
  product_id: string | null;
  description: string;
  qty: number;
  unit_cost: number;
}

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  heat_pump: "Heat pump", cylinder: "Cylinder", radiator: "Radiator", emitter: "Emitter",
  pipe: "Pipe", fitting: "Fitting", valve: "Valve", control: "Control", electrical: "Electrical",
  consumable: "Consumable", solar_panel: "Solar panel", inverter: "Inverter", battery: "Battery",
  mounting: "Mounting", labour: "Labour", other: "Other",
};

export const PRODUCT_CATEGORY_OPTIONS = Object.entries(PRODUCT_CATEGORY_LABELS) as [ProductCategory, string][];

export const LINE_SOURCE_LABELS: Record<LineSource, string> = {
  design: "Design", rule: "Rule", base_kit: "Base kit", manual: "Manual",
};
export const LINE_SOURCE_COLORS: Record<LineSource, string> = {
  design: "#0E7490", rule: "#7C3AED", base_kit: "#15803D", manual: "#6B7280",
};

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: "Draft", ready: "Ready", sent: "Sent", accepted: "Accepted", rejected: "Rejected", expired: "Expired",
};
export const PROPOSAL_STATUS_COLORS: Record<ProposalStatus, string> = {
  draft: "#64748B", ready: "#B45309", sent: "#0E7490", accepted: "#1B7A6E", rejected: "#DC2626", expired: "#94A3B8",
};

export const PO_TYPE_LABELS: Record<PoType, string> = { supplier: "Supplier", subcontractor: "Subcontractor" };
export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  draft: "Draft", sent: "Sent", confirmed: "Confirmed", received: "Received", cancelled: "Cancelled",
};
