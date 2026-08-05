import "server-only";

import type { User } from "@supabase/supabase-js";
import { sendInvitationEmail } from "@/lib/invitationMail";
import {
  createInvitationToken,
  findAuthUserByEmail,
  hashInvitationToken,
  invitationExpiresAt,
  invitationUrl,
  isValidInvitationEmail,
  normalizeInvitationEmail,
  type InvitationRecord,
} from "@/lib/invitations";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/lib/supabase/types";

const INVITATION_SELECT =
  "id,email,role,category,status,profile_id,customer_id,employee_id,token_hash,expires_at,sent_at,accepted_at,revoked_at";

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function supportedRole(role: AppRole): role is "customer" | "employee" {
  return role === "customer" || role === "employee";
}

async function invitationById(id: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("invitations")
    .select(INVITATION_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) throw error ?? new Error("Invitation not found");
  return data as InvitationRecord;
}

async function recipientForInvitation(invitation: InvitationRecord) {
  const admin = createSupabaseAdminClient();

  if (invitation.role === "customer" && invitation.customer_id) {
    const { data, error } = await admin
      .from("customers")
      .select("id,contact_name,company_name,portal_user_id")
      .eq("id", invitation.customer_id)
      .maybeSingle();
    if (error || !data) throw error ?? new Error("Customer not found");
    return {
      name: String(data.contact_name || data.company_name || invitation.email),
      linkedUserId: (data.portal_user_id as string | null) ?? null,
    };
  }

  if (invitation.role === "employee" && invitation.employee_id) {
    const { data, error } = await admin
      .from("employee_profiles")
      .select("id,full_name,user_id")
      .eq("id", invitation.employee_id)
      .maybeSingle();
    if (error || !data) throw error ?? new Error("Employee not found");
    return {
      name: String(data.full_name || invitation.email),
      linkedUserId: (data.user_id as string | null) ?? null,
    };
  }

  throw new Error("Invitation has no matching recipient");
}

async function authUserById(id: string | null): Promise<User | null> {
  if (!id) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin.auth.admin.getUserById(id);
  return data.user ?? null;
}

async function provisionInvitedUser({
  invitation,
  name,
  linkedUserId,
  invitedBy,
}: {
  invitation: InvitationRecord;
  name: string;
  linkedUserId: string | null;
  invitedBy: string;
}) {
  if (!supportedRole(invitation.role)) throw new Error("Unsupported invitation role");

  const admin = createSupabaseAdminClient();
  const email = normalizeInvitationEmail(invitation.email);
  if (!isValidInvitationEmail(email) || email === "info@hausvia.de") {
    throw new Error("Invalid invitation email");
  }

  const profileUser = await authUserById(invitation.profile_id);
  const linkedUser = await authUserById(linkedUserId);
  const emailUser = await findAuthUserByEmail(email);
  const userIds = new Set(
    [profileUser?.id, linkedUser?.id, emailUser?.id].filter((id): id is string => Boolean(id)),
  );
  if (userIds.size > 1) {
    throw new Error("Email is already assigned to another account");
  }

  let user = emailUser ?? profileUser ?? linkedUser;
  if (user) {
    const { data: existingProfile, error: profileReadError } = await admin
      .from("user_profiles")
      .select("role,status,onboarding_completed")
      .eq("id", user.id)
      .maybeSingle();
    if (profileReadError) throw profileReadError;
    if (
      existingProfile &&
      (existingProfile.role !== invitation.role ||
        existingProfile.status === "active" ||
        existingProfile.onboarding_completed)
    ) {
      throw new Error("An active account already exists for this email");
    }

    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      email,
      email_confirm: true,
      ban_duration: "none",
    });
    if (error || !data.user) throw error ?? new Error("Auth user could not be updated");
    user = data.user;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (error || !data.user) throw error ?? new Error("Auth user could not be created");
    user = data.user;
  }

  const { error: profileError } = await admin.from("user_profiles").upsert(
    {
      id: user.id,
      role: invitation.role,
      email,
      full_name: name,
      status: "invited",
      onboarding_completed: false,
      invited_by: invitedBy,
    },
    { onConflict: "id" },
  );
  if (profileError) throw profileError;

  // Do not link the Auth user to customer/employee data before the one-time
  // invitation token has been accepted. Even a recovery session for an invited
  // Auth user must not gain row access to portal data prematurely.

  return user.id;
}

export async function sendInvitationById(invitationId: string, invitedBy: string) {
  if (!isUuid(invitationId)) throw new Error("Invalid invitation id");
  const invitation = await invitationById(invitationId);
  if (!supportedRole(invitation.role) || invitation.status === "accepted") {
    throw new Error("Invitation cannot be sent");
  }

  const recipient = await recipientForInvitation(invitation);
  const profileId = await provisionInvitedUser({
    invitation,
    name: recipient.name,
    linkedUserId: recipient.linkedUserId,
    invitedBy,
  });

  const admin = createSupabaseAdminClient();
  const token = createInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const now = new Date().toISOString();
  const expiresAt = invitationExpiresAt();
  const previous = {
    status: invitation.status,
    token_hash: invitation.token_hash,
    expires_at: invitation.expires_at,
    sent_at: invitation.sent_at,
    accepted_at: invitation.accepted_at,
    revoked_at: invitation.revoked_at,
  };

  let markSentQuery = admin
    .from("invitations")
    .update({
      email: normalizeInvitationEmail(invitation.email),
      profile_id: profileId,
      status: "sent",
      token_hash: tokenHash,
      expires_at: expiresAt,
      sent_at: now,
      accepted_at: null,
      revoked_at: null,
      invited_by: invitedBy,
    })
    .eq("id", invitation.id)
    .eq("status", invitation.status);
  markSentQuery = invitation.token_hash
    ? markSentQuery.eq("token_hash", invitation.token_hash)
    : markSentQuery.is("token_hash", null);
  const { data: markedSent, error: updateError } = await markSentQuery
    .select("id")
    .maybeSingle();
  if (updateError || !markedSent) throw updateError ?? new Error("Invitation could not be updated");

  try {
    await sendInvitationEmail({
      to: normalizeInvitationEmail(invitation.email),
      recipientName: recipient.name,
      invitationLink: invitationUrl(token),
      idempotencyKey: `hausvia-invitation-${invitation.id}-${tokenHash}`,
    });
  } catch (error) {
    await admin.from("invitations").update(previous).eq("id", invitation.id).eq("token_hash", tokenHash);
    throw error;
  }

  await admin.from("audit_logs").insert({
    actor_id: invitedBy,
    action: invitation.status === "sent" ? "invitation.resent" : "invitation.sent",
    entity_table: "invitations",
    entity_id: invitation.id,
    metadata: { role: invitation.role, expires_at: expiresAt },
  });

  return { role: invitation.role, invitationId: invitation.id, expiresAt };
}

export async function revokeInvitationById(invitationId: string, actorId: string) {
  if (!isUuid(invitationId)) throw new Error("Invalid invitation id");
  const invitation = await invitationById(invitationId);
  if (!supportedRole(invitation.role) || invitation.status === "accepted") {
    throw new Error("Invitation cannot be revoked");
  }

  const admin = createSupabaseAdminClient();
  const revokedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("invitations")
    .update({
      status: "revoked",
      expires_at: null,
      accepted_at: null,
      revoked_at: revokedAt,
    })
    .eq("id", invitation.id)
    .neq("status", "accepted")
    .select("id")
    .maybeSingle();
  if (error || !data) throw error ?? new Error("Invitation could not be revoked");

  if (invitation.profile_id) {
    await admin.from("user_profiles").update({ status: "disabled" }).eq("id", invitation.profile_id).eq("status", "invited");
    await admin.auth.admin.updateUserById(invitation.profile_id, { ban_duration: "876000h" });
  }

  await admin.from("audit_logs").insert({
    actor_id: actorId,
    action: "invitation.revoked",
    entity_table: "invitations",
    entity_id: invitation.id,
    metadata: { role: invitation.role },
  });

  return { role: invitation.role, invitationId: invitation.id };
}

export async function latestInvitationIdForEmail(email: string, role: string) {
  if (role !== "customer" && role !== "employee") return null;
  const normalizedEmail = normalizeInvitationEmail(email);
  if (!isValidInvitationEmail(normalizedEmail)) return null;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("invitations")
    .select("id")
    .ilike("email", normalizedEmail)
    .eq("role", role)
    .neq("status", "accepted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}
