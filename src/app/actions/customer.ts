"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/supabase/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { acceptOfferAndActivateCustomer } from "@/lib/offerAcceptance";

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
    .select("id")
    .eq("id", offerId)
    .eq("status", "released")
    .single();

  if (!offer?.id) {
    redirect("/portal/offers?error=acceptance");
  }

  const admin = createSupabaseAdminClient();
  await acceptOfferAndActivateCustomer({
    admin,
    offerId,
    acceptedBy: profile.id,
    acceptanceName: signatureName,
    acceptanceSignature: signature,
    requireReleased: true,
  });

  revalidatePath("/portal/offers");
  revalidatePath("/portal/care");
  revalidatePath("/admin/offers");
  revalidatePath("/admin/projects");
  redirect("/portal/offers?status=accepted");
}
