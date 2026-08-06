"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_REACTIONS = new Set(["👍", "✅", "❤️", "🙂", "❄️", "🛠️"]);

function pathForRole(
  role: "admin" | "employee" | "customer",
  propertyId: string,
) {
  if (role === "admin") return `/admin/properties/${propertyId}`;
  if (role === "employee") return `/app/properties/${propertyId}`;
  return `/portal/properties/${propertyId}?view=chat`;
}

function withFeedback(path: string, key: "error", value: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${key}=${encodeURIComponent(value)}`;
}

export async function reactToPropertyMessageAction(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== "active") redirect("/login");
  const messageId = String(formData.get("messageId") ?? "");
  const propertyId = String(formData.get("propertyId") ?? "");
  const emoji = String(formData.get("emoji") ?? "");
  const fallback = pathForRole(profile.role, propertyId);
  if (!messageId || !propertyId || !ALLOWED_REACTIONS.has(emoji))
    redirect(withFeedback(fallback, "error", "Ungültige Reaktion"));
  const supabase = await createSupabaseServerClient();
  const { data: message } = await supabase
    .from("property_messages")
    .select("id")
    .eq("id", messageId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (!message)
    redirect(withFeedback(fallback, "error", "Nachricht nicht verfügbar"));
  const { data: existing } = await supabase
    .from("message_reactions")
    .select("id")
    .eq("message_id", messageId)
    .eq("user_id", profile.id)
    .eq("emoji", emoji)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("message_reactions")
      .delete()
      .eq("id", existing.id)
      .eq("user_id", profile.id);
  } else {
    await supabase
      .from("message_reactions")
      .insert({ message_id: messageId, user_id: profile.id, emoji });
  }
  revalidatePath(fallback.split("?")[0]);
}

export async function markPropertyMessagesReadAction(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== "active") redirect("/login");
  const propertyId = String(formData.get("propertyId") ?? "");
  const fallback = pathForRole(profile.role, propertyId);
  const supabase = await createSupabaseServerClient();
  const { data: messages } = await supabase
    .from("property_messages")
    .select("id,sender_id")
    .eq("property_id", propertyId)
    .limit(500);
  const messagesByOthers = (messages ?? []).filter(
    (message) => message.sender_id !== profile.id,
  );
  if (messagesByOthers.length) {
    await supabase.from("message_reads").upsert(
      messagesByOthers.map((message) => ({
        message_id: message.id,
        user_id: profile.id,
        read_at: new Date().toISOString(),
      })),
      { onConflict: "message_id,user_id" },
    );
  }
  revalidatePath(fallback.split("?")[0]);
}
