"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, portalPathForRole, requireProfile } from "@/lib/supabase/auth";
import { siteUrl } from "@/lib/supabase/config";
import {
  revokeInvitationById,
  sendInvitationById,
} from "@/lib/invitationLifecycle";
import {
  getInvitationByToken,
  hashInvitationToken,
  isValidInvitationEmail,
  normalizeInvitationEmail,
} from "@/lib/invitations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ADMIN_BOOTSTRAP_EMAIL = "info@hausvia.de";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function passwordValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function isValidPassword(password: string) {
  return password.length >= 8 && password.length <= 128;
}

export async function loginAction(formData: FormData) {
  const email = normalizeInvitationEmail(value(formData, "email"));
  const password = passwordValue(formData, "password");
  const supabase = await createSupabaseServerClient();

  const { data: signIn, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) redirect("/login?error=login");

  let profile = await getCurrentProfile();
  if (
    !profile &&
    signIn.user?.email?.trim().toLowerCase() === ADMIN_BOOTSTRAP_EMAIL
  ) {
    const admin = createSupabaseAdminClient();
    const { data: bootstrapped, error: bootstrapError } = await admin
      .from("user_profiles")
      .insert({
        id: signIn.user.id,
        role: "admin",
        email: ADMIN_BOOTSTRAP_EMAIL,
        full_name: "Christoph Pfad",
        status: "active",
        onboarding_completed: true,
      })
      .select("*")
      .single();
    if (!bootstrapError && bootstrapped) profile = bootstrapped;
  }
  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();
    redirect("/login?error=login");
  }
  if (!profile.onboarding_completed) redirect("/onboarding");

  redirect(portalPathForRole(profile.role));
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = normalizeInvitationEmail(value(formData, "email"));

  // Always return the same result. This intentionally avoids disclosing whether
  // an address has a portal account or whether the mail provider is available.
  try {
    if (isValidInvitationEmail(email)) {
      const admin = createSupabaseAdminClient();
      const { data: eligibleProfile } = await admin
        .from("user_profiles")
        .select("id")
        .ilike("email", email)
        .eq("status", "active")
        .eq("onboarding_completed", true)
        .limit(1)
        .maybeSingle();

      if (eligibleProfile || email === ADMIN_BOOTSTRAP_EMAIL) {
        const supabase = await createSupabaseServerClient();
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
        });
      }
    }
  } catch {
    // Neutral response by design.
  }

  redirect("/forgot-password?status=sent");
}

export async function completePasswordResetAction(formData: FormData) {
  const password = passwordValue(formData, "password");
  const confirmPassword = passwordValue(formData, "confirmPassword");

  if (!isValidPassword(password) || password !== confirmPassword) {
    redirect("/reset-password?error=password");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/forgot-password?status=sent");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role,status,onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.status !== "active" || !profile.onboarding_completed) {
    await supabase.auth.signOut();
    redirect("/login?error=login");
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/reset-password?error=password");

  await supabase.auth.signOut();
  redirect("/login?status=password-updated");
}

export async function completeOnboardingAction(formData: FormData) {
  const password = passwordValue(formData, "password");
  const confirmPassword = passwordValue(formData, "confirmPassword");

  if (!isValidPassword(password) || password !== confirmPassword) {
    redirect("/onboarding?error=password");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: currentProfile } = await supabase
    .from("user_profiles")
    .select("role,status,onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  // Invitations are activated exclusively with their one-time token. This
  // legacy onboarding route remains available only for an already active user.
  if (!currentProfile || currentProfile.status !== "active") {
    await supabase.auth.signOut();
    redirect("/login?error=invitation");
  }
  if (currentProfile.onboarding_completed) {
    redirect(portalPathForRole(currentProfile.role));
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/onboarding?error=password");

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .update({
      onboarding_completed: true,
      last_login_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .eq("status", "active")
    .select("role")
    .single();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    redirect("/login?error=login");
  }

  redirect(portalPathForRole(profile.role));
}

export async function acceptInvitationAction(formData: FormData) {
  const token = value(formData, "token");
  const password = passwordValue(formData, "password");
  const confirmPassword = passwordValue(formData, "confirmPassword");
  const invitationPath = `/einladung/${encodeURIComponent(token)}`;

  if (!isValidPassword(password) || password !== confirmPassword) {
    redirect(`${invitationPath}?error=password`);
  }

  const invitation = await getInvitationByToken(token);
  const expiresAt = invitation?.expires_at ? new Date(invitation.expires_at) : null;
  if (
    !invitation ||
    invitation.status !== "sent" ||
    !invitation.profile_id ||
    (invitation.role !== "customer" && invitation.role !== "employee") ||
    !expiresAt ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getTime() <= Date.now()
  ) {
    redirect(`${invitationPath}?error=invalid`);
  }

  const admin = createSupabaseAdminClient();
  const tokenHash = hashInvitationToken(token);
  const acceptedAt = new Date().toISOString();
  const { data: claimedInvitation, error: claimError } = await admin
    .from("invitations")
    .update({
      status: "accepted",
      accepted_at: acceptedAt,
    })
    .eq("id", invitation.id)
    .eq("status", "sent")
    .eq("token_hash", tokenHash)
    .gt("expires_at", acceptedAt)
    .select("id")
    .maybeSingle();

  if (claimError || !claimedInvitation) {
    redirect(`${invitationPath}?error=invalid`);
  }

  let activationSucceeded = false;
  try {
    const { error: authError } = await admin.auth.admin.updateUserById(invitation.profile_id, {
      password,
      email_confirm: true,
      ban_duration: "none",
    });
    if (authError) throw authError;

    if (invitation.role === "employee" && invitation.employee_id) {
      const { error } = await admin
        .from("employee_profiles")
        .update({ user_id: invitation.profile_id, status: "active" })
        .eq("id", invitation.employee_id);
      if (error) throw error;
    }

    if (invitation.role === "customer" && invitation.customer_id) {
      const { error } = await admin
        .from("customers")
        .update({
          portal_user_id: invitation.profile_id,
          status: "active",
        })
        .eq("id", invitation.customer_id);
      if (error) throw error;
      const { error: membershipError } = await admin.from("customer_users").upsert(
        {
          customer_id: invitation.customer_id,
          user_id: invitation.profile_id,
          active: true,
        },
        { onConflict: "customer_id,user_id" },
      );
      if (membershipError) throw membershipError;
    }

    // Activate the authorization profile last. If a preceding link update
    // fails, the account remains unable to enter the portal and can be retried.
    const { data: activatedProfile, error: profileError } = await admin
      .from("user_profiles")
      .update({
        status: "active",
        onboarding_completed: true,
        last_login_at: acceptedAt,
      })
      .eq("id", invitation.profile_id)
      .eq("role", invitation.role)
      .eq("status", "invited")
      .select("id")
      .maybeSingle();
    if (profileError || !activatedProfile) throw profileError ?? new Error("Profile activation failed");

    activationSucceeded = true;
  } catch {
    if (invitation.role === "employee" && invitation.employee_id) {
      await admin
        .from("employee_profiles")
        .update({ user_id: null, status: "invited" })
        .eq("id", invitation.employee_id)
        .eq("user_id", invitation.profile_id);
    }
    if (invitation.role === "customer" && invitation.customer_id) {
      await admin
        .from("customer_users")
        .delete()
        .eq("customer_id", invitation.customer_id)
        .eq("user_id", invitation.profile_id);
      await admin
        .from("customers")
        .update({ portal_user_id: null, status: "inactive" })
        .eq("id", invitation.customer_id)
        .eq("portal_user_id", invitation.profile_id);
    }
    await admin
      .from("invitations")
      .update({ status: "sent", accepted_at: null })
      .eq("id", invitation.id)
      .eq("status", "accepted");
  }

  if (!activationSucceeded) {
    redirect(`${invitationPath}?error=activation`);
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: invitation.profile_id,
    action: "invitation.accepted",
    entity_table: "invitations",
    entity_id: invitation.id,
    metadata: {
      role: invitation.role,
      customer_id: invitation.customer_id,
      employee_id: invitation.employee_id,
    },
  });
  if (auditError) {
    // Activation already succeeded, so do not show a false failure to the
    // invited user. Keep an operational signal without exposing internals.
    console.error("[Hausvia Auth] Invitation acceptance audit failed", auditError);
  }

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: normalizeInvitationEmail(invitation.email),
    password,
  });

  if (signInError) redirect("/login?status=activated");
  redirect(portalPathForRole(invitation.role));
}

function invitationAdminPath(role: "customer" | "employee") {
  return role === "customer" ? "/admin/customers" : "/admin/employees";
}

export async function sendInvitationAction(formData: FormData) {
  const profile = await requireProfile(["admin"]);
  const invitationId = value(formData, "invitationId");
  let role: "customer" | "employee";

  try {
    const result = await sendInvitationById(invitationId, profile.id);
    role = result.role;
  } catch {
    redirect("/admin/invitations?error=Einladung%20konnte%20nicht%20versendet%20werden");
  }

  revalidatePath("/admin/invitations");
  revalidatePath(invitationAdminPath(role));
  redirect(`${invitationAdminPath(role)}?status=Einladung%20wurde%20versendet`);
}

export async function resendInvitationAction(formData: FormData) {
  return sendInvitationAction(formData);
}

export async function renewInvitationAction(formData: FormData) {
  return sendInvitationAction(formData);
}

export async function revokeInvitationAction(formData: FormData) {
  const profile = await requireProfile(["admin"]);
  const invitationId = value(formData, "invitationId");
  let role: "customer" | "employee";

  try {
    const result = await revokeInvitationById(invitationId, profile.id);
    role = result.role;
  } catch {
    redirect("/admin/invitations?error=Einladung%20konnte%20nicht%20widerrufen%20werden");
  }

  revalidatePath("/admin/invitations");
  revalidatePath(invitationAdminPath(role));
  redirect(`${invitationAdminPath(role)}?status=Einladung%20wurde%20widerrufen`);
}
