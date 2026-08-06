import type { AppRole } from "@/lib/supabase/types";

const CHAT_TIME_ZONE = "Europe/Berlin";

export const CHAT_ROLE_LABELS: Record<AppRole, string> = {
  admin: "Hausvia",
  employee: "Mitarbeiter",
  customer: "Kunde",
};

export function chatRoleLabel(role: AppRole | null | undefined) {
  return role ? CHAT_ROLE_LABELS[role] : "Teilnehmer";
}

export function chatSenderName({
  displayName,
  role,
  isCurrentUser,
}: {
  displayName: string | null;
  role: AppRole | null | undefined;
  isCurrentUser: boolean;
}) {
  if (isCurrentUser) return "Sie";
  if (role === "admin") return "Hausvia";
  return displayName?.trim() || chatRoleLabel(role);
}

export function chatInitials(
  displayName: string | null,
  role: AppRole | null | undefined,
) {
  if (role === "admin") return "HV";
  const initials = (displayName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || chatRoleLabel(role).slice(0, 2).toUpperCase();
}

export function chatCalendarDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHAT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function chatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: CHAT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
