import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole, UserProfile } from "@/lib/supabase/types";

export function portalPathForRole(role: AppRole) {
  if (role === "admin") return "/admin/properties";
  if (role === "employee") return "/app";
  return "/portal";
}

export async function getCurrentProfile() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase.from("user_profiles").select("*").eq("id", user.id).maybeSingle();

  return (data as UserProfile | null) ?? null;
}

export async function requireProfile(allowedRoles?: AppRole[]) {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  if (profile.status !== "active") {
    redirect(profile.status === "disabled" ? "/login?status=disabled" : "/login?status=inactive");
  }
  if (!profile.onboarding_completed) redirect("/onboarding");
  if (allowedRoles && !allowedRoles.includes(profile.role)) redirect(portalPathForRole(profile.role));

  return profile;
}

export async function redirectAuthenticatedUser() {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== "active") return;

  if (!profile.onboarding_completed) redirect("/onboarding");
  redirect(portalPathForRole(profile.role));
}
