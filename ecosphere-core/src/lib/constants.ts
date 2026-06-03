import type { PipelineStage, ProductType, LeadSource, PropertyType } from "./types";

// Canonical macro-stage (bucket) labels.
export const STAGE_LABELS: Record<PipelineStage, string> = {
  new_enquiry: "New Enquiry",
  contacted: "Contacted",
  survey_booked: "Survey Booked",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};

// Accent colour per bucket.
export const STAGE_COLORS: Record<PipelineStage, string> = {
  new_enquiry: "#64748B",
  contacted: "#0E7490",
  survey_booked: "#7C3AED",
  quoted: "#B45309",
  won: "#1B7A6E",
  lost: "#DC2626",
};

export const PRODUCT_LABELS: Record<ProductType, string> = {
  ashp: "ASHP",
  solar_pv: "Solar PV",
  battery: "Battery",
  heating_upgrade: "Heating Upgrade",
  service: "Service",
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  google_ads: "Google Ads",
  facebook: "Facebook",
  referral: "Referral",
  website: "Website",
  other: "Other",
};

export const PROPERTY_LABELS: Record<PropertyType, string> = {
  detached: "Detached",
  semi_detached: "Semi-detached",
  terraced: "Terraced",
  bungalow: "Bungalow",
  flat: "Flat",
  commercial: "Commercial",
  other: "Other",
};

export const PRODUCT_OPTIONS = Object.entries(PRODUCT_LABELS) as [ProductType, string][];
export const LEAD_SOURCE_OPTIONS = Object.entries(LEAD_SOURCE_LABELS) as [LeadSource, string][];
export const PROPERTY_OPTIONS = Object.entries(PROPERTY_LABELS) as [PropertyType, string][];

export const AGED_THRESHOLD_DAYS = 14;

// Full GBP, e.g. £11,866.
export const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n ?? 0);

// Compact GBP for KPI tiles, e.g. £1,149k / £121k.
export const gbpK = (n: number) => {
  const v = n ?? 0;
  if (Math.abs(v) >= 1000) return `£${Math.round(v / 1000).toLocaleString("en-GB")}k`;
  return `£${Math.round(v).toLocaleString("en-GB")}`;
};

// Initials for avatar chips.
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

// Whole-day age from an ISO timestamp.
export function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}
