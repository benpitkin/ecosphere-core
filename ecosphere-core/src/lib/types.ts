// Domain types mirroring the Postgres schema.

export type PipelineStage =
  | "new_enquiry" | "contacted" | "survey_booked" | "quoted" | "won" | "lost";

export type ProductType =
  | "ashp" | "solar_pv" | "battery" | "heating_upgrade" | "service";

export type LeadSource =
  | "google_ads" | "facebook" | "referral" | "website" | "other";

export type PropertyType =
  | "detached" | "semi_detached" | "terraced" | "bungalow" | "flat" | "commercial" | "other";

export type TagCategory =
  | "lead_source" | "product_interest" | "pipeline_stage"
  | "job_status" | "customer_type" | "property_characteristic";

export type ActivityType = "note" | "call" | "email" | "sms" | "meeting" | "system";

export interface Tag {
  id: string;
  name: string;
  category: TagCategory;
  color: string;
}

// A saved board view.
export interface Pipeline {
  id: string;
  slug: string;
  name: string;
  sort: number;
  is_default: boolean;
}

// A granular, orderable column within a pipeline. `bucket` is the canonical
// BI macro-stage (the PipelineStage enum) this column rolls up to.
export interface Stage {
  id: string;
  pipeline_id: string;
  key: string;
  label: string;
  bucket: PipelineStage;
  sort: number;
  color: string;
}

export interface Contact {
  id: string;
  ghl_id: string | null;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postcode: string | null;
  source: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export type BusStatus = "applied" | "issued" | "redeemed" | "paid" | "expired" | "rejected";

export interface BusVoucher {
  id: string;
  deal_id: string;
  voucher_ref: string | null;
  amount: number;
  status: BusStatus;
  applied_at: string | null;
  issued_at: string | null;
  redeemed_at: string | null;
  paid_at: string | null;
  expires_at: string | null;
  notes: string | null;
}

export interface Deal {
  id: string;
  customer_name: string;
  address: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  property_type: PropertyType | null;
  value_gross: number;
  value_bus_grant: number;
  value_net: number;
  product_interest: ProductType;
  lead_source: LeadSource;
  stage: PipelineStage;
  stage_changed_at: string;
  lost_reason: string | null;
  owner_id: string | null;
  contact_id: string | null;
  pipeline_id: string | null;
  pipeline_stage_id: string | null;
  pipeline_stage_changed_at: string;
  ghl_opportunity_id: string | null;
  created_at: string;
  updated_at: string;
  tags?: Tag[];
}

export interface Activity {
  id: number;
  deal_id: string;
  type: ActivityType;
  body: string;
  created_at: string;
}

export interface StageHistoryRow {
  id: number;
  deal_id: string;
  from_stage: PipelineStage | null;
  to_stage: PipelineStage;
  changed_at: string;
}
