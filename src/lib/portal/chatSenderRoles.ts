import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/lib/supabase/types";

type ChatSenderRole = {
  sender_role: AppRole | null;
};

const APP_ROLES = new Set<AppRole>(["admin", "employee", "customer"]);

export async function attachChatSenderRoles<
  T extends { sender_id: string | null; message_type: string },
>(
  messages: T[],
): Promise<Array<T & ChatSenderRole>> {
  const senderIds = [
    ...new Set(
      messages.flatMap((message) =>
        message.message_type === "user" && message.sender_id
          ? [message.sender_id]
          : [],
      ),
    ),
  ];

  if (!senderIds.length) {
    return messages.map((message) => ({ ...message, sender_role: null }));
  }

  const admin = createSupabaseAdminClient();
  const { data: profiles, error } = await admin
    .from("user_profiles")
    .select("id,role")
    .in("id", senderIds);

  if (error) {
    return messages.map((message) => ({ ...message, sender_role: null }));
  }

  const roleBySenderId = new Map<string, AppRole>(
    (profiles ?? []).flatMap((profile) =>
      APP_ROLES.has(profile.role as AppRole)
        ? [[profile.id, profile.role as AppRole] as const]
        : [],
    ),
  );

  return messages.map((message) => ({
    ...message,
    sender_role:
      message.message_type === "user" && message.sender_id
        ? (roleBySenderId.get(message.sender_id) ?? null)
        : null,
  }));
}
