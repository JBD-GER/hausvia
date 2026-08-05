import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/config";
import { portalPathForRole } from "@/lib/supabase/auth";
import type { UserProfile } from "@/lib/supabase/types";

const ADMIN_BOOTSTRAP_EMAIL = "info@hausvia.de";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(`${siteUrl}/login?error=callback`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${siteUrl}/login?error=callback`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${siteUrl}/login?error=session`);
  }

  const { data: existingProfile } = await supabase.from("user_profiles").select("*").eq("id", user.id).maybeSingle();
  let profile = existingProfile as UserProfile | null;

  if (!profile) {
    if (user.email?.trim().toLowerCase() !== ADMIN_BOOTSTRAP_EMAIL) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${siteUrl}/login?error=profile`);
    }

    const admin = createSupabaseAdminClient();
    const { data, error: profileError } = await admin
      .from("user_profiles")
      .insert({
        id: user.id,
        role: "admin",
        email: ADMIN_BOOTSTRAP_EMAIL,
        full_name: "Christoph Pfad",
        status: "active",
        onboarding_completed: true,
      })
      .select("*")
      .single();

    if (profileError || !data) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${siteUrl}/login?error=profile`);
    }
    profile = data as UserProfile;
  }

  if (profile.status !== "active") {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      `${siteUrl}/login?status=${profile.status === "disabled" ? "disabled" : "inactive"}`,
    );
  }

  await supabase.from("user_profiles").update({ last_login_at: new Date().toISOString() }).eq("id", user.id);

  if (next === "/reset-password") {
    return NextResponse.redirect(`${siteUrl}/reset-password`);
  }

  if (!profile.onboarding_completed) {
    return NextResponse.redirect(`${siteUrl}/onboarding`);
  }

  return NextResponse.redirect(`${siteUrl}${portalPathForRole(profile.role)}`);
}
