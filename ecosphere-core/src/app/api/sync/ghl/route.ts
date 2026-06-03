import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ghlConfigured, fetchAllContacts, fetchAllOpportunities } from "@/lib/ghl";

export const dynamic = "force-dynamic";

// POST /api/sync/ghl — pull contacts + opportunities from GoHighLevel into Supabase.
// Auth required (must be a signed-in CRM user). Idempotent: upserts on the GHL ids.
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

    // Build a GHL contact id -> our contact id map.
    const { data: savedContacts } = await supabase
      .from("contacts").select("id, ghl_id, full_name, postcode").not("ghl_id", "is", null);
    const contactByGhl = new Map((savedContacts ?? []).map((c: any) => [c.ghl_id, c]));

    // 2) Resolve the default pipeline + its stages -------------------------
    const { data: pipelines } = await supabase.from("pipelines").select("*").order("sort");
    const defaultPipeline = (pipelines ?? []).find((p: any) => p.is_default) ?? (pipelines ?? [])[0];
    if (!defaultPipeline) throw new Error("No pipeline found. Run the seed first.");
    const { data: stages } = await supabase
      .from("pipeline_stages").select("*").eq("pipeline_id", defaultPipeline.id).order("sort");
    const stageByKey = new Map((stages ?? []).map((s: any) => [s.key, s]));
    const firstStage = (stages ?? [])[0];

    // Map a GHL opportunity status -> one of our seeded stage keys.
    const stageForStatus = (status?: string) => {
      switch ((status || "open").toLowerCase()) {
        case "won": return stageByKey.get("won-deposit") ?? firstStage;
        case "lost":
        case "abandoned": return stageByKey.get("lost") ?? firstStage;
        default: return stageByKey.get("new-enquiry") ?? firstStage;
      }
    };

    // 3) Opportunities -> deals --------------------------------------------
    const opps = await fetchAllOpportunities();
    const dealRows = opps.map((o) => {
      const stage = stageForStatus(o.status);
      const ghlContactId = o.contactId || o.contact?.id;
      const contact = ghlContactId ? contactByGhl.get(ghlContactId) : null;
      const isLost = stage?.bucket === "lost";
      return {
        ghl_opportunity_id: o.id,
        customer_name: contact?.full_name || o.name || "Unknown",
        postcode: contact?.postcode ?? null,
        contact_id: contact?.id ?? null,
        value_gross: Number(o.monetaryValue ?? 0),
        value_bus_grant: 0,
        product_interest: "service" as const, // GHL doesn't carry product; default, edit in CRM
        lead_source: "other" as const,
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
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Sync failed" }, { status: 500 });
  }
}
