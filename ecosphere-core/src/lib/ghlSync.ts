// =============================================================================
// Shared GoHighLevel -> hub sync. Pure logic that accepts any Supabase client
// (a user-scoped one from the Sync button, or a service-role one from the
// webhook). Idempotent: safe to run on every webhook fire or on a timer.
// =============================================================================
import { fetchAllContacts, fetchAllOpportunities, fetchPipelines } from "@/lib/ghl";
import type { ProductType, LeadSource } from "@/lib/types";

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
const BUCKET_COLOR: Record<string, string> = {
  new_enquiry: "#64748B", contacted: "#0E7490", survey_booked: "#7C3AED",
  quoted: "#B45309", won: "#1B7A6E", lost: "#DC2626",
};

export async function runGhlSync(supabase: any) {
  // 1) Contacts
  const ghlContacts = await fetchAllContacts();
  const contactRows = ghlContacts.map((c) => ({
    ghl_id: c.id,
    full_name: c.contactName || [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown",
    first_name: c.firstName ?? null, last_name: c.lastName ?? null,
    email: c.email ?? null, phone: c.phone ?? null,
    address: c.address1 ?? null, postcode: c.postalCode ?? null,
    source: c.source ?? null, tags: c.tags ?? [],
  }));
  if (contactRows.length) {
    const { error } = await supabase.from("contacts").upsert(contactRows, { onConflict: "ghl_id" });
    if (error) throw new Error(`contacts upsert: ${error.message}`);
  }
  const { data: savedContacts } = await supabase
    .from("contacts").select("id, ghl_id, full_name, postcode, source, tags").not("ghl_id", "is", null);
  const contactByGhl = new Map<string, any>((savedContacts ?? []).map((c: any) => [c.ghl_id, c]));

  // 2) Mirror GHL pipelines + stages exactly
  const ghlPipelines = await fetchPipelines();
  const pipeIdByGhl = new Map<string, string>();
  const stageIdByGhl = new Map<string, string>();
  const firstStageByPipe = new Map<string, string>();
  const bucketByStageId = new Map<string, string>();
  let pipesUpserted = 0, stagesUpserted = 0;

  for (let i = 0; i < ghlPipelines.length; i++) {
    const gp = ghlPipelines[i];
    const slug = `ghl-${gp.id}`;
    let hpId: string;
    const { data: ex } = await supabase.from("pipelines").select("id").eq("slug", slug).maybeSingle();
    if (ex) { hpId = ex.id; await supabase.from("pipelines").update({ name: gp.name, sort: i }).eq("id", hpId); }
    else {
      const { data: ins, error } = await supabase.from("pipelines").insert({ slug, name: gp.name, sort: i, is_default: false }).select("id").single();
      if (error) throw new Error(`pipeline insert: ${error.message}`);
      hpId = ins.id;
    }
    pipeIdByGhl.set(gp.id, hpId); pipesUpserted++;

    const gstages = gp.stages ?? [];
    for (let j = 0; j < gstages.length; j++) {
      const gs = gstages[j];
      const key = `ghl-${gs.id}`;
      const bucket = inferBucket(gs.name);
      const color = BUCKET_COLOR[bucket] ?? "#64748B";
      const sort = typeof gs.position === "number" ? gs.position : j;
      const { data: exs } = await supabase.from("pipeline_stages").select("id").eq("pipeline_id", hpId).eq("key", key).maybeSingle();
      let sid: string;
      if (exs) { sid = exs.id; await supabase.from("pipeline_stages").update({ label: gs.name, bucket, sort, color }).eq("id", sid); }
      else {
        const { data: ins, error } = await supabase.from("pipeline_stages").insert({ pipeline_id: hpId, key, label: gs.name, bucket, sort, color }).select("id").single();
        if (error) throw new Error(`stage insert: ${error.message}`);
        sid = ins.id;
      }
      bucketByStageId.set(sid, bucket);
      stageIdByGhl.set(gs.id, sid); stagesUpserted++;
      if (j === 0) firstStageByPipe.set(gp.id, sid);
    }
  }

  const mainGhl = ghlPipelines.find((p) => /sales/i.test(p.name)) ?? ghlPipelines[0];
  if (mainGhl) {
    await supabase.from("pipelines").update({ is_default: false }).neq("slug", `ghl-${mainGhl.id}`);
    await supabase.from("pipelines").update({ is_default: true }).eq("slug", `ghl-${mainGhl.id}`);
  }
  const defaultPipeId = (mainGhl && pipeIdByGhl.get(mainGhl.id)) || pipeIdByGhl.values().next().value;
  const defaultFirstStage = (mainGhl && firstStageByPipe.get(mainGhl.id)) || firstStageByPipe.values().next().value || null;

  // 3) Opportunities -> deals
  const opps = await fetchAllOpportunities();
  let placed = 0, fellBack = 0;
  const dealRows = opps.map((o) => {
    const hubPipe = (o.pipelineId && pipeIdByGhl.get(o.pipelineId)) || defaultPipeId;
    let hubStage = o.pipelineStageId ? stageIdByGhl.get(o.pipelineStageId) : undefined;
    if (hubStage) placed++;
    else { hubStage = (o.pipelineId && firstStageByPipe.get(o.pipelineId)) || defaultFirstStage || undefined; fellBack++; }
    const ghlContactId = o.contactId || o.contact?.id;
    const contact = ghlContactId ? contactByGhl.get(ghlContactId) : null;
    const isLost = hubStage ? bucketByStageId.get(hubStage) === "lost" : false;
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
      pipeline_id: hubPipe,
      pipeline_stage_id: hubStage ?? null,
      lost_reason: isLost ? "Imported from GoHighLevel" : null,
    };
  });
  if (dealRows.length) {
    const { error } = await supabase.from("deals").upsert(dealRows, { onConflict: "ghl_opportunity_id" });
    if (error) throw new Error(`deals upsert: ${error.message}`);
  }

  // 4) Remove old seeded pipelines/stages
  let cleaned = false;
  if (stageIdByGhl.size > 0) {
    try {
      await supabase.from("pipeline_stages").delete().not("key", "like", "ghl-%");
      await supabase.from("pipelines").delete().not("slug", "like", "ghl-%");
      cleaned = true;
    } catch { /* leave seeded rows if cleanup is blocked */ }
  }

  return {
    ok: true,
    contacts_synced: contactRows.length,
    opportunities_synced: dealRows.length,
    pipelines_mirrored: pipesUpserted,
    stages_mirrored: stagesUpserted,
    deals_placed_exact: placed,
    deals_fell_back: fellBack,
    seeded_cleanup: cleaned,
  };
}
