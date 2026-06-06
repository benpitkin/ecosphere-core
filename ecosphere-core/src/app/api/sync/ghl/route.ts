import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ghlConfigured, fetchAllContacts, fetchAllOpportunities, fetchPipelines } from "@/lib/ghl";
import type { ProductType, LeadSource } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function inferProduct(text: string): ProductType {
  const s = (text || "").toLowerCase();
  if (/\b(solar|pv|panel|photovoltaic)\b/.test(s)) return "solar_pv";
  if (/\b(battery|storage|givenergy|tesla|powerwall|ess)\b/.test(s)) return "battery";
  if (/\b(ashp|air[-\s]?source|heat[-\s]?pump|heatpump|aerotherm|arotherm|ecodan)\b/.test(s)) return "ashp";
  if (/\b(boiler|radiator|underfloor|heating|cylinder)\b/.test(s)) return "heating_upgrade";
  if (/\b(service|maintenance|repair|callout|breakdown)\b/.test(s)) return "service";
  return "service";
}

function inferSource(src?: string | null): LeadSource {
  const s = (src || "").toLowerCase();
  if (/facebook|fb|meta|instagram|insta/.test(s)) return "facebook";
  if (/google|adwords|ppc|ads|gclid/.test(s)) return "google_ads";
  if (/referr|word[-\s]?of[-\s]?mouth|friend|recommend/.test(s)) return "referral";
  if (/website|web|form|organic|seo|landing/.test(s)) return "website";
  return "other";
}

// Map a GHL stage NAME (often with emojis) to a canonical pipeline bucket.
function inferBucket(name: string): string {
  const s = (name || "").toLowerCase();
  if (/won|accepted|install|deposit|sold|paid|complete/.test(s)) return "won";
  if (/lost|dead|unqualified|not proceeding|declined|abandoned|cancel/.test(s)) return "lost";
  if (/survey/.test(s)) return "survey_booked";
  if (/proposal|quote|quoted|pricing|estimate/.test(s)) return "quoted";
  if (/enquir|new lead|new sale|^new\b/.test(s)) return "new_enquiry";
  if (/contact|engaged|follow|identified|service|aftercare|ongoing|customer|nurtur/.test(s)) return "contacted";
  return "new_enquiry";
}

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!ghlConfigured()) {
    return NextResponse.json(
      { error: "GoHighLevel not configured. Set GHL_API_KEY and GHL_LOCATION_ID in your environment." },
      { status: 400 }
    );
  }

  try {
    // 1) Contacts -----------------------------------------------------------
    const ghlContacts = await fetchAllContacts();
    const contactRows = ghlContacts.map((c) => ({
      ghl_id: c.id,
      full_name: c.contactName || [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown",
      first_name: c.firstName ?? null,
      last_name: c.lastName ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
      address: c.address1 ?? null,
      postcode: c.postalCode ?? null,
      source: c.source ?? null,
      tags: c.tags ?? [],
    }));
    if (contactRows.length) {
      const { error } = await supabase.from("contacts").upsert(contactRows, { onConflict: "ghl_id" });
      if (error) throw new Error(`contacts upsert: ${error.message}`);
    }

    const { data: savedContacts } = await supabase
      .from("contacts").select("id, ghl_id, full_name, postcode, source, tags").not("ghl_id", "is", null);
    const contactByGhl = new Map((savedContacts ?? []).map((c: any) => [c.ghl_id, c]));

    // 2) Default pipeline + hub stages -------------------------------------
    const { data: pipelines } = await supabase.from("pipelines").select("*").order("sort");
    const defaultPipeline = (pipelines ?? []).find((p: any) => p.is_default) ?? (pipelines ?? [])[0];
    if (!defaultPipeline) throw new Error("No pipeline found. Run the seed first.");
    const { data: stages } = await supabase
      .from("pipeline_stages").select("*").eq("pipeline_id", defaultPipeline.id).order("sort");
    const stageByKey = new Map((stages ?? []).map((s: any) => [s.key, s]));
    const stageByLabelNorm = new Map((stages ?? []).map((s: any) => [norm(s.label), s]));
    const firstStage = (stages ?? [])[0];

    const preferredKeyByBucket: Record<string, string> = {
      new_enquiry: "new-enquiry", contacted: "engaged", survey_booked: "survey-booked",
      quoted: "quote-sent", won: "won-deposit", lost: "lost",
    };
    const stageForBucket = (b: string) =>
      stageByKey.get(preferredKeyByBucket[b]) ?? (stages ?? []).find((s: any) => s.bucket === b) ?? firstStage;

    const stageForStatus = (status?: string) => {
      switch ((status || "open").toLowerCase()) {
        case "won": return stageByKey.get("won-deposit") ?? firstStage;
        case "lost":
        case "abandoned": return stageByKey.get("lost") ?? firstStage;
        default: return stageByKey.get("new-enquiry") ?? firstStage;
      }
    };

    // 3) GHL pipelines -> map stage id to stage name (best-effort) ----------
    const ghlStageNameById = new Map<string, string>();
    let ghlPipelineNames: string[] = [];
    try {
      const ghlPipelines = await fetchPipelines();
      ghlPipelineNames = ghlPipelines.map((p) => p.name);
      for (const p of ghlPipelines) for (const st of (p.stages ?? [])) ghlStageNameById.set(st.id, st.name);
    } catch {
      // If the pipelines endpoint is unavailable, fall back to status mapping below.
    }

    // 4) Opportunities -> deals --------------------------------------------
    const opps = await fetchAllOpportunities();
    let matchedByName = 0, matchedByBucket = 0, fellBack = 0;
    const unmatched = new Set<string>();
    const dealRows = opps.map((o) => {
      const ghlStageName = o.pipelineStageId ? ghlStageNameById.get(o.pipelineStageId) : undefined;
      let stage = ghlStageName ? stageByLabelNorm.get(norm(ghlStageName)) : undefined;
      if (stage) { matchedByName++; }
      else if (ghlStageName) { stage = stageForBucket(inferBucket(ghlStageName)); matchedByBucket++; }
      else { stage = stageForStatus(o.status); fellBack++; }

      const ghlContactId = o.contactId || o.contact?.id;
      const contact = ghlContactId ? contactByGhl.get(ghlContactId) : null;
      const isLost = stage?.bucket === "lost";
      const inferenceText = [o.name, ...((contact?.tags as string[]) ?? [])].filter(Boolean).join(" ");
      return {
        ghl_opportunity_id: o.id,
        customer_name: contact?.full_name || o.name || "Unknown",
        postcode: contact?.postcode ?? null,
        contact_id: contact?.id ?? null,
        value_gross: Number(o.monetaryValue ?? 0),
        value_bus_grant: 0,
        product_interest: inferProduct(inferenceText),
        lead_source: inferSource(contact?.source),
        pipeline_id: defaultPipeline.id,
        pipeline_stage_id: stage?.id ?? null,
        lost_reason: isLost ? "Imported from GoHighLevel" : null,
      };
    });
    if (dealRows.length) {
      const { error } = await supabase.from("deals").upsert(dealRows, { onConflict: "ghl_opportunity_id" });
      if (error) throw new Error(`deals upsert: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      contacts_synced: contactRows.length,
      opportunities_synced: dealRows.length,
      pipeline: defaultPipeline.name,
      ghl_pipelines: ghlPipelineNames,
      stage_match: { matched_by_name: matchedByName, matched_by_bucket: matchedByBucket, fell_back_to_status: fellBack },
      unmatched_ghl_stages: Array.from(unmatched),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Sync failed" }, { status: 500 });
  }
}
