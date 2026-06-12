"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/supabase/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function acceptOfferAction(formData: FormData) {
  const profile = await requireProfile(["customer"]);
  const offerId = text(formData, "offerId");
  const signatureName = text(formData, "signatureName");
  const signature = text(formData, "signature");
  const confirmed = formData.get("confirmed") === "on";

  if (!offerId || !signatureName || !signature || !confirmed) {
    redirect("/portal/offers?error=acceptance");
  }

  const supabase = await createSupabaseServerClient();
  const { data: offer } = await supabase
    .from("offers")
    .select("id,customer_id,project_id,title,offer_items(title,description,unit)")
    .eq("id", offerId)
    .eq("status", "released")
    .single();

  if (!offer?.id) {
    redirect("/portal/offers?error=acceptance");
  }

  const admin = createSupabaseAdminClient();

  await admin
    .from("offers")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_by: profile.id,
      acceptance_name: signatureName,
      acceptance_signature: signature,
      acceptance_confirmed: true,
    })
    .eq("id", offerId)
    .eq("status", "released");

  let projectId = offer.project_id as string | null;

  if (offer?.project_id) {
    await admin.from("projects").update({ status: "active" }).eq("id", offer.project_id);
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
        employee_instructions: "Vor dem ersten Einsatz bitte Objektzugang, Leistungsumfang und Ansprechpartner intern prüfen.",
        care_started_at: new Date().toISOString().slice(0, 10),
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
            offerItems.map((item: { title: string; description: string | null; unit: string }, index: number) => ({
              project_id: projectId,
              title: item.title,
              description: item.description,
              category: item.title,
              interval_label: item.unit || "nach Vereinbarung",
              interval_unit: item.unit?.toLowerCase().includes("monat") ? "monthly" : "custom",
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

  await admin.from("customers").update({ status: "active" }).eq("id", offer.customer_id);

  revalidatePath("/portal/offers");
  revalidatePath("/portal/care");
  revalidatePath("/admin/offers");
  revalidatePath("/admin/projects");
  redirect("/portal/offers?status=accepted");
}
