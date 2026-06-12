import type { SupabaseClient } from "@supabase/supabase-js";

type OfferItemForProject = {
  title: string;
  description: string | null;
  unit: string | null;
};

type OfferForActivation = {
  id: string;
  status: string;
  customer_id: string;
  project_id: string | null;
  title: string;
  offer_items: OfferItemForProject[] | null;
};

function intervalUnitFromUnit(unit?: string | null) {
  const normalized = (unit ?? "").toLowerCase();
  if (normalized.includes("monat")) return "monthly";
  if (normalized.includes("woche")) return "weekly";
  if (normalized.includes("tag") || normalized.includes("werktag")) return "daily";
  if (normalized.includes("einmal") || normalized.includes("pauschale")) return "one_time";
  return "custom";
}

export async function acceptOfferAndActivateCustomer({
  admin,
  offerId,
  acceptedBy,
  acceptanceName,
  acceptanceSignature,
  requireReleased = false,
}: {
  admin: SupabaseClient;
  offerId: string;
  acceptedBy?: string | null;
  acceptanceName: string;
  acceptanceSignature: string;
  requireReleased?: boolean;
}) {
  const { data, error } = await admin
    .from("offers")
    .select("id,status,customer_id,project_id,title,offer_items(title,description,unit)")
    .eq("id", offerId)
    .single();

  if (error || !data) {
    throw error ?? new Error("Angebot nicht gefunden");
  }

  const offer = data as OfferForActivation;

  if (requireReleased && offer.status !== "released") {
    throw new Error("Angebot ist nicht freigegeben");
  }

  const acceptedAt = new Date().toISOString();
  await admin
    .from("offers")
    .update({
      status: "accepted",
      accepted_at: acceptedAt,
      accepted_by: acceptedBy ?? null,
      acceptance_name: acceptanceName,
      acceptance_signature: acceptanceSignature,
      acceptance_confirmed: true,
    })
    .eq("id", offerId);

  let projectId = offer.project_id;

  if (projectId) {
    await admin
      .from("projects")
      .update({ status: "active", care_started_at: acceptedAt.slice(0, 10) })
      .eq("id", projectId);
  } else {
    const [{ data: customer }, { data: lead }] = await Promise.all([
      admin
        .from("customers")
        .select("id,company_name,contact_name,billing_address")
        .eq("id", offer.customer_id)
        .single(),
      admin
        .from("leads")
        .select("object_address,object_type,frequency,requested_services")
        .eq("customer_id", offer.customer_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const { data: project } = await admin
      .from("projects")
      .insert({
        customer_id: offer.customer_id,
        status: "active",
        name: `Objektbetreuung ${customer?.company_name || customer?.contact_name || "Hausvia Kunde"}`,
        object_address: lead?.object_address || customer?.billing_address || "Adresse prüfen",
        object_type: lead?.object_type || "Objekt aus angenommenem Angebot",
        public_notes: "Dieses Projekt wurde nach Annahme des Angebots aktiviert.",
        admin_notes: `Automatisch aus angenommenem Angebot ${offer.title} erstellt.`,
        employee_instructions:
          "Vor dem ersten Einsatz bitte Objektzugang, Leistungsumfang und Ansprechpartner intern prüfen. Danach Mitarbeiter zuweisen.",
        care_started_at: acceptedAt.slice(0, 10),
      })
      .select("id")
      .single();

    projectId = project?.id ?? null;

    if (projectId) {
      await admin.from("offers").update({ project_id: projectId }).eq("id", offer.id);
    }
  }

  if (projectId) {
    const existingTasks = await admin.from("project_tasks").select("id").eq("project_id", projectId).limit(1);
    if (!existingTasks.data?.length) {
      const offerItems = Array.isArray(offer.offer_items) ? offer.offer_items : [];
      if (offerItems.length) {
        const { data: tasks } = await admin
          .from("project_tasks")
          .insert(
            offerItems.map((item, index) => ({
              project_id: projectId,
              title: item.title,
              description: item.description,
              category: item.title,
              interval_label: item.unit || "nach Vereinbarung",
              interval_unit: intervalUnitFromUnit(item.unit),
              visible_to_customer: true,
              sort_order: index,
            })),
          )
          .select("id,interval_label,interval_unit");

        if (tasks?.length) {
          await admin.from("task_intervals").insert(
            tasks.map((task) => ({
              task_id: task.id,
              label: task.interval_label || "nach Vereinbarung",
              interval_unit: task.interval_unit || "custom",
            })),
          );
        }
      }
    }
  }

  await Promise.all([
    admin.from("customers").update({ status: "active" }).eq("id", offer.customer_id),
    admin.from("leads").update({ status: "converted" }).eq("customer_id", offer.customer_id),
  ]);

  return {
    customerId: offer.customer_id,
    projectId,
  };
}
