import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/config";
import { portalPathForRole } from "@/lib/supabase/auth";
import type { AppRole, UserProfile } from "@/lib/supabase/types";

function safeRole(value: unknown): AppRole {
  if (value === "admin" || value === "employee" || value === "customer") return value;
  return "customer";
}

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
    const role = safeRole(user.user_metadata?.role);
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("user_profiles")
      .insert({
        id: user.id,
        role,
        email: user.email ?? "",
        full_name: String(user.user_metadata?.full_name ?? ""),
        status: "invited",
      })
      .select("*")
      .single();
    profile = data as UserProfile;
  }

  await supabase.from("user_profiles").update({ last_login_at: new Date().toISOString() }).eq("id", user.id);

  if (next) {
    return NextResponse.redirect(`${siteUrl}${next.startsWith("/") ? next : `/${next}`}`);
  }

  if (!profile.onboarding_completed) {
    return NextResponse.redirect(`${siteUrl}/onboarding`);
  }

  return NextResponse.redirect(`${siteUrl}${portalPathForRole(profile.role)}`);
}
