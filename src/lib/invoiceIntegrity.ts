import { createHash, timingSafeEqual } from "node:crypto";

type InvoiceContentState = {
  status?: string | null;
  invoice_kind?: string | null;
  invoice_cycle_id?: string | null;
  billing_month?: string | null;
  immutable_at?: string | null;
  original_pdf_bucket?: string | null;
  original_pdf_path?: string | null;
};

export type InvoiceLifecycleStatus =
  | "draft"
  | "released"
  | "open"
  | "paid"
  | "overdue"
  | "canceled";

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function hasStoredInvoiceOriginal(invoice: InvoiceContentState) {
  return (
    nonEmptyString(invoice.original_pdf_bucket) &&
    nonEmptyString(invoice.original_pdf_path)
  );
}

export function hasPartialStoredInvoiceOriginal(invoice: InvoiceContentState) {
  return (
    nonEmptyString(invoice.original_pdf_bucket) !==
    nonEmptyString(invoice.original_pdf_path)
  );
}

export function isInvoiceContentImmutable(invoice: InvoiceContentState) {
  return Boolean(
    invoice.immutable_at ||
      invoice.invoice_kind === "regular" ||
      (invoice.invoice_cycle_id && invoice.status !== "draft") ||
      hasStoredInvoiceOriginal(invoice) ||
      hasPartialStoredInvoiceOriginal(invoice) ||
      (invoice.billing_month && invoice.status !== "draft"),
  );
}

export function invoiceRecipientEmail(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  const value = (snapshot as Record<string, unknown>).email;
  if (typeof value !== "string") return null;
  const email = value.trim();
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return null;
  }
  return email;
}

export function invoicePdfSha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifyInvoicePdfSha256(
  bytes: Uint8Array,
  expectedSha256: unknown,
) {
  if (
    typeof expectedSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(expectedSha256)
  ) {
    return false;
  }
  const actual = Buffer.from(invoicePdfSha256(bytes), "hex");
  const expected = Buffer.from(expectedSha256, "hex");
  return timingSafeEqual(actual, expected);
}

export function safeInvoicePdfFilename(invoiceNumber: unknown) {
  const safeNumber = String(invoiceNumber || "rechnung")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${safeNumber || "rechnung"}-rechnung-hausvia.pdf`;
}

export function canMarkInvoicePaid(status: unknown) {
  return ["released", "open", "overdue"].includes(String(status));
}

export function canCancelInvoice(status: unknown) {
  return ["draft", "released", "open", "paid", "overdue"].includes(
    String(status),
  );
}

export function canRoleDownloadInvoice(role: unknown) {
  return role === "admin" || role === "customer";
}

export function normalizeInvoiceCancellationReason(value: unknown) {
  if (typeof value !== "string") return null;
  const reason = value.trim();
  return reason.length >= 5 && reason.length <= 1_000 ? reason : null;
}

const invoiceErrorDescriptions: Record<string, string> = {
  required_data:
    "Für die Rechnung fehlen Pflichtangaben, zum Beispiel Abrechnungsdaten, Empfängeranschrift oder Grundvergütung.",
  invalid_amount:
    "Mindestens ein Rechnungsbetrag ist ungültig oder außerhalb des zulässigen Bereichs.",
  invalid_tax_rate: "Mindestens ein Umsatzsteuersatz ist ungültig.",
  zero_invoice:
    "Die Rechnung wurde blockiert, weil keine abrechenbare Grundvergütung oder Zusatzleistung vorhanden ist.",
  invoice_content_changed:
    "Rechnungskopf und gespeicherte Rechnungspositionen stimmen nicht mehr überein.",
  invoice_pdf_integrity:
    "Die Prüfsumme des gespeicherten Original-PDFs stimmt nicht.",
  invoice_content_integrity:
    "Die strukturierten Rechnungsdaten stimmen nicht mit dem gespeicherten Original überein.",
  invoice_pdf_conflict:
    "Für diese Rechnung existiert bereits eine abweichende Originaldatei.",
  billing_failed:
    "Die automatische Abrechnung ist wegen eines technischen Fehlers fehlgeschlagen.",
};

export function invoiceErrorDescription(code: unknown) {
  if (typeof code !== "string" || !code.trim()) {
    return "Für diese Rechnung wurde ein nicht näher klassifizierter Fehler gespeichert.";
  }
  if (code.startsWith("processing:")) {
    return "Die automatische Rechnungserstellung wird aktuell verarbeitet.";
  }
  return (
    invoiceErrorDescriptions[code] ??
    "Die automatische Abrechnung hat einen internen Fehlercode gespeichert. Die technische Meldung enthält weitere Details."
  );
}
