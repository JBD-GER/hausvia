export function formatDateTime(value: unknown) {
  if (!value || typeof value !== "string") return "-";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatDate(value: unknown) {
  if (!value || typeof value !== "string") return "-";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value));
}

export function formatEuro(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);
}

export function asText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function offerStatusLabel(status: unknown) {
  const labels: Record<string, string> = {
    draft: "In Vorbereitung",
    released: "An Kunde gesendet",
    accepted: "Angenommen",
    rejected: "Abgelehnt",
    expired: "Abgelaufen",
    archived: "Archiviert",
  };

  return labels[String(status ?? "")] ?? asText(status);
}

export function leadStatusLabel(status: unknown) {
  const labels: Record<string, string> = {
    new: "Neu",
    qualified: "Angebot in Vorbereitung",
    converted: "Kunde aktiv",
    archived: "Archiviert",
  };

  return labels[String(status ?? "")] ?? asText(status);
}
