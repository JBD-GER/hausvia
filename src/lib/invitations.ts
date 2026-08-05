import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { siteUrl } from "@/lib/supabase/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/lib/supabase/types";

export const INVITATION_VALID_DAYS = 30;
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,128}$/;

export type InvitationRecord = {
  id: string;
  email: string;
  role: AppRole;
  category: string | null;
  status: string;
  profile_id: string | null;
  customer_id: string | null;
  employee_id: string | null;
  token_hash: string | null;
  expires_at: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
};

export type InvitationPreview =
  | {
      state: "ready";
      email: string;
      role: "customer" | "employee";
      category: string | null;
      expiresAt: string;
    }
  | { state: "expired" | "accepted" | "revoked" | "invalid" };

export function normalizeInvitationEmail(value: string) {
  return value.trim().toLocaleLowerCase("de-DE");
}

export function isValidInvitationEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function createInvitationToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function invitationExpiresAt(from = new Date()) {
  return new Date(
    from.getTime() + INVITATION_VALID_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}

export function invitationUrl(token: string) {
  return new URL(`/einladung/${encodeURIComponent(token)}`, siteUrl).toString();
}

export function isInvitationTokenShapeValid(token: string) {
  return INVITATION_TOKEN_PATTERN.test(token);
}

export async function findAuthUserByEmail(email: string): Promise<User | null> {
  const admin = createSupabaseAdminClient();
  const normalizedEmail = normalizeInvitationEmail(email);
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    const matchingUser = data.users.find(
      (user) => normalizeInvitationEmail(user.email ?? "") === normalizedEmail,
    );
    if (matchingUser) return matchingUser;
    if (!data.nextPage) return null;
    page = data.nextPage;
  }
}

export async function getInvitationByToken(token: string) {
  if (!isInvitationTokenShapeValid(token)) return null;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("invitations")
    .select(
      "id,email,role,category,status,profile_id,customer_id,employee_id,token_hash,expires_at,sent_at,accepted_at,revoked_at",
    )
    .eq("token_hash", hashInvitationToken(token))
    .maybeSingle();

  if (error || !data) return null;
  return data as InvitationRecord;
}

export async function getInvitationPreview(token: string): Promise<InvitationPreview> {
  const invitation = await getInvitationByToken(token);
  if (!invitation) return { state: "invalid" };
  if (invitation.status === "accepted") return { state: "accepted" };
  if (invitation.status === "revoked") return { state: "revoked" };

  const expiresAt = invitation.expires_at
    ? new Date(invitation.expires_at)
    : null;
  if (
    invitation.status === "expired" ||
    !expiresAt ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getTime() <= Date.now()
  ) {
    if (invitation.status === "sent") {
      const admin = createSupabaseAdminClient();
      await admin
        .from("invitations")
        .update({ status: "expired" })
        .eq("id", invitation.id)
        .eq("status", "sent");
    }
    return { state: "expired" };
  }

  if (
    invitation.status !== "sent" ||
    (invitation.role !== "customer" && invitation.role !== "employee")
  ) {
    return { state: "invalid" };
  }

  return {
    state: "ready",
    email: invitation.email,
    role: invitation.role,
    category: invitation.category,
    expiresAt: invitation.expires_at as string,
  };
}
