"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile, portalPathForRole } from "@/lib/supabase/auth";
import { siteUrl } from "@/lib/supabase/config";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function loginAction(formData: FormData) {
  const email = value(formData, "email");
  const password = value(formData, "password");
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=login");

  const profile = await getCurrentProfile();
  if (!profile) redirect("/onboarding");
  if (!profile.onboarding_completed) redirect("/onboarding");

  redirect(portalPathForRole(profile.role));
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = value(formData, "email");

  if (!email) {
    redirect("/forgot-password?error=email");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });

  if (error) {
    redirect("/forgot-password?error=reset");
  }

  redirect("/forgot-password?status=sent");
}

export async function completePasswordResetAction(formData: FormData) {
  const password = value(formData, "password");
  const confirmPassword = value(formData, "confirmPassword");

  if (password.length < 8 || password !== confirmPassword) {
    redirect("/reset-password?error=password");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/forgot-password?error=session");

  const profile = await getCurrentProfile();

  if (profile?.status === "disabled") {
    await supabase.auth.signOut();
    redirect("/login?status=disabled");
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/reset-password?error=password");

  if (!profile) {
    await supabase.auth.signOut();
    redirect("/login?status=password-updated");
  }

  const { data: updatedProfile } = await supabase
    .from("user_profiles")
    .update({
      status: profile.status === "invited" ? "active" : profile.status,
      onboarding_completed: true,
      last_login_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select("*")
    .single();

  if (profile.role === "employee") {
    await supabase.from("employee_profiles").update({ status: "active" }).eq("user_id", user.id);
  }

  redirect(portalPathForRole(updatedProfile?.role ?? profile.role));
}

export async function completeOnboardingAction(formData: FormData) {
  const password = value(formData, "password");
  const confirmPassword = value(formData, "confirmPassword");

  if (password.length < 8 || password !== confirmPassword) {
    redirect("/onboarding?error=password");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/onboarding?error=password");

  const { data: profile } = await supabase
    .from("user_profiles")
    .update({
      status: "active",
      onboarding_completed: true,
      last_login_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select("*")
    .single();

  if (profile?.role === "employee") {
    await supabase.from("employee_profiles").update({ status: "active" }).eq("user_id", user.id);
  }

  redirect(portalPathForRole(profile?.role ?? "customer"));
}
