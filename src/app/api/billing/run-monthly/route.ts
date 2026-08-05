import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createBusinessDocumentPdf,
  type InvoiceIssuerSnapshot,
} from "@/lib/businessDocumentPdf";
import { sendPortalDocumentEmail } from "@/lib/mail";
import {
  addCalendarDays,
  berlinIsoDate,
  calculateBillingTotals,
  calculateTaxBreakdown,
  carePeriodOverlapsBillingPeriod,
  centsToLegacyAmount,
  previousBerlinBillingPeriod,
  selectCompensationRateForPeriod,
  validateCompanySettings,
  validatePropertyBillingProfile,
} from "@/lib/monthlyBilling";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type CompanySettings = {
  legal_name: string;
  brand_name: string | null;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  country: string;
  tax_number: string | null;
  vat_id: string | null;
  commercial_register: string | null;
  management: string | null;
  email: string;
  phone: string | null;
  bank_name: string;
  iban: string;
  bic: string;
  payment_due_days: number;
  invoice_prefix: string;
  default_tax_rate_bps: number;
  invoice_email_from: string | null;
  invoice_email_reply_to: string | null;
};

type BillingProfile = {
  property_id: string;
  recipient_name: string;
  address_addition: string | null;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  country: string;
  email: string;
};

type PropertySettings = {
  property_id: string;
  monthly_fee_net_cents: number;
  tax_rate_bps: number;
};

type PropertyRow = {
  id: string;
  customer_id: string;
  name: string;
  status: string;
  care_start_date: string | null;
  care_end_date: string | null;
  archived_at: string | null;
};

type CompensationRate = {
  property_id: string;
  net_amount_cents: number;
  tax_rate_bps: number;
  valid_from: string;
  valid_until: string | null;
};

type ExtraCharge = {
  id: string;
  description: string;
  service_date: string;
  net_amount_cents: number;
  material_cost_cents: number;
  tax_rate_bps: number;
};

type InvoiceItemRow = {
  id: string;
  title: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_net_cents: number | null;
  total_net_cents: number | null;
  unit_net: number;
  total_net: number;
  tax_rate_bps: number | null;
  extra_charge_id: string | null;
  service_date: string | null;
};

type MonthlyLine = {
  title: string;
  description: string;
  unit: string;
  netCents: number;
  taxRateBps: number;
  extraChargeId: string | null;
  serviceDate: string | null;
};

type ExistingInvoice = {
  id: string;
  invoice_number: string;
  status: string;
  error_code: string | null;
  updated_at: string;
  original_pdf_bucket: string | null;
  original_pdf_path: string | null;
  original_pdf_sha256: string | null;
  document_content_sha256: string | null;
  issuer_snapshot: Record<string, unknown> | null;
  recipient_snapshot: Record<string, unknown> | null;
  bank_snapshot: Record<string, unknown> | null;
  invoice_date: string | null;
  due_date: string | null;
  title: string;
  billing_note: string | null;
  service_period_start: string | null;
  service_period_end: string | null;
};

type InvoiceClaim = {
  invoice_id: string;
  invoice_number: string;
  claimed: boolean;
  invoice_status: string;
  active_processing_token: string | null;
};

type RunResult = {
  propertyId: string;
  status: "sent" | "skipped" | "failed";
  invoiceId?: string;
  message?: string;
};

class MonthlyBillingError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MonthlyBillingError";
  }
}

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function asSafeNonNegativeInteger(value: unknown, label: string) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new MonthlyBillingError("invalid_amount", `${label} ist keine gültige Cent-Angabe.`);
  }
  return number;
}

function formatAddress(parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(", ");
}

function safePdfSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "rechnung";
}

function sha256Buffer(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin" }).format(
    new Date(`${value}T12:00:00Z`),
  );
}

function invoiceFromAddress(settings: CompanySettings) {
  const configured = settings.invoice_email_from?.trim();
  if (!configured) return undefined;
  if (configured.includes("<")) return configured;
  return `${settings.brand_name || "Hausvia"} <${configured}>`;
}

function issuerSnapshots(settings: CompanySettings) {
  const address = formatAddress([
    `${settings.street} ${settings.house_number}`,
    `${settings.postal_code} ${settings.city}`,
    settings.country,
  ]);
  const issuerSnapshot = {
    legal_name: settings.legal_name,
    brand_name: settings.brand_name,
    street: settings.street,
    house_number: settings.house_number,
    postal_code: settings.postal_code,
    city: settings.city,
    country: settings.country,
    full_address: address,
    tax_number: settings.tax_number,
    vat_id: settings.vat_id,
    commercial_register: settings.commercial_register,
    management: settings.management,
    email: settings.email,
    phone: settings.phone,
  };
  const bankSnapshot = {
    bank_name: settings.bank_name,
    iban: settings.iban,
    bic: settings.bic,
    payment_due_days: settings.payment_due_days,
  };
  const pdfIssuer: InvoiceIssuerSnapshot = {
    legalName: settings.legal_name,
    brandName: settings.brand_name,
    address,
    taxNumber: settings.tax_number,
    vatId: settings.vat_id,
    commercialRegister: settings.commercial_register,
    managingDirector: settings.management,
    email: settings.email,
    phone: settings.phone,
    bankName: settings.bank_name,
    iban: settings.iban,
    bic: settings.bic,
  };
  return { issuerSnapshot, bankSnapshot, pdfIssuer };
}

function recipientSnapshot(profile: BillingProfile) {
  return {
    recipient_name: profile.recipient_name,
    address_addition: profile.address_addition,
    street: profile.street,
    house_number: profile.house_number,
    postal_code: profile.postal_code,
    city: profile.city,
    country: profile.country,
    email: profile.email,
    full_address: formatAddress([
      `${profile.street} ${profile.house_number}`,
      `${profile.postal_code} ${profile.city}`,
      profile.country,
    ]),
  };
}

function billingProfileFromSnapshot(
  propertyId: string,
  snapshot: Record<string, unknown> | null,
) {
  const validation = validatePropertyBillingProfile(snapshot);
  if (!snapshot || !validation.valid) return null;
  return {
    property_id: propertyId,
    recipient_name: String(snapshot.recipient_name),
    address_addition:
      typeof snapshot.address_addition === "string"
        ? snapshot.address_addition
        : null,
    street: String(snapshot.street),
    house_number: String(snapshot.house_number),
    postal_code: String(snapshot.postal_code),
    city: String(snapshot.city),
    country: String(snapshot.country),
    email: String(snapshot.email),
  } satisfies BillingProfile;
}

function pdfIssuerFromSnapshots(
  issuer: Record<string, unknown>,
  bank: Record<string, unknown>,
): InvoiceIssuerSnapshot {
  const optional = (value: unknown) =>
    typeof value === "string" && value.trim() ? value : null;
  return {
    legalName: String(issuer.legal_name ?? ""),
    brandName: optional(issuer.brand_name),
    address: String(issuer.full_address ?? ""),
    taxNumber: optional(issuer.tax_number),
    vatId: optional(issuer.vat_id),
    commercialRegister: optional(issuer.commercial_register),
    managingDirector: optional(issuer.management),
    email: String(issuer.email ?? ""),
    phone: optional(issuer.phone),
    bankName: String(bank.bank_name ?? ""),
    iban: String(bank.iban ?? ""),
    bic: String(bank.bic ?? ""),
  };
}

function linesForProperty(settings: PropertySettings, charges: ExtraCharge[], propertyName: string, period: { start: string; end: string }) {
  const lines: MonthlyLine[] = [];
  const monthlyFee = asSafeNonNegativeInteger(settings.monthly_fee_net_cents, "Grundvergütung");
  const baseTaxRate = asSafeNonNegativeInteger(settings.tax_rate_bps, "Umsatzsteuersatz");
  if (baseTaxRate > 10_000) throw new MonthlyBillingError("invalid_tax_rate", "Ungültiger Umsatzsteuersatz.");

  if (monthlyFee > 0) {
    lines.push({
      title: "Monatliche Grundvergütung",
      description: `${propertyName}, Leistungszeitraum ${displayDate(period.start)} bis ${displayDate(period.end)}`,
      unit: "Monat",
      netCents: monthlyFee,
      taxRateBps: baseTaxRate,
      extraChargeId: null,
      serviceDate: null,
    });
  }

  for (const charge of charges) {
    const serviceNet = asSafeNonNegativeInteger(charge.net_amount_cents, "Zusatzkosten");
    const materialNet = asSafeNonNegativeInteger(charge.material_cost_cents ?? 0, "Materialkosten");
    const netCents = serviceNet + materialNet;
    if (!Number.isSafeInteger(netCents)) throw new MonthlyBillingError("invalid_amount", "Zusatzkosten sind zu hoch.");
    const taxRateBps = asSafeNonNegativeInteger(charge.tax_rate_bps, "Umsatzsteuersatz");
    if (taxRateBps > 10_000) throw new MonthlyBillingError("invalid_tax_rate", "Ungültiger Umsatzsteuersatz.");
    if (netCents === 0) continue;
    lines.push({
      title: charge.description,
      description: `Zusatzleistung vom ${displayDate(charge.service_date)}${materialNet ? ` inkl. Material (${centsToLegacyAmount(materialNet).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} netto)` : ""}`,
      unit: "Pauschale",
      netCents,
      taxRateBps,
      extraChargeId: charge.id,
      serviceDate: charge.service_date,
    });
  }

  return lines;
}

function linesFromInvoiceItems(items: InvoiceItemRow[]): MonthlyLine[] {
  return items.map((item) => ({
    title: item.title,
    description: item.description ?? "",
    unit: item.unit || "Pauschale",
    netCents: item.total_net_cents ?? Math.round(Number(item.total_net || 0) * 100),
    taxRateBps: item.tax_rate_bps ?? 0,
    extraChargeId: item.extra_charge_id,
    serviceDate: item.service_date,
  }));
}

async function notifyAdmins({
  adminIds,
  type,
  title,
  body,
  idempotencyKey,
  propertyId,
  entityType,
  entityId,
}: {
  adminIds: string[];
  type: string;
  title: string;
  body: string;
  idempotencyKey: string;
  propertyId?: string;
  entityType?: string;
  entityId?: string;
}) {
  if (!adminIds.length) return;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("notifications").upsert(
    adminIds.map((recipientId) => ({
      recipient_id: recipientId,
      type,
      title,
      body,
      property_id: propertyId ?? null,
      entity_type: entityType ?? null,
      entity_id: entityId ?? null,
      idempotency_key: `${idempotencyKey}:${recipientId}`,
    })),
    { onConflict: "recipient_id,idempotency_key", ignoreDuplicates: true },
  );
  if (error) throw error;
}

async function markLinkedChargesBilled(invoiceId: string, billedAt: string) {
  const admin = createSupabaseAdminClient();
  const { data: items, error } = await admin
    .from("invoice_items")
    .select("id,extra_charge_id")
    .eq("invoice_id", invoiceId)
    .not("extra_charge_id", "is", null);
  if (error) throw error;

  const updates = await Promise.all(
    (items ?? []).map((item) =>
      admin
        .from("extra_charges")
        .update({ billing_status: "billed", invoice_item_id: item.id, billed_at: billedAt })
        .eq("id", item.extra_charge_id)
        .in("billing_status", ["open", "queued"]),
    ),
  );
  const failed = updates.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

async function notifyCustomer(invoiceId: string, property: PropertyRow, invoiceNumber: string) {
  const admin = createSupabaseAdminClient();
  const [customerUsersResult, customerResult] = await Promise.all([
    admin.from("customer_users").select("user_id").eq("customer_id", property.customer_id).eq("active", true),
    admin.from("customers").select("portal_user_id").eq("id", property.customer_id).maybeSingle(),
  ]);
  if (customerUsersResult.error || customerResult.error) {
    throw customerUsersResult.error ?? customerResult.error;
  }
  const customerUsers = customerUsersResult.data;
  const customer = customerResult.data;
  const recipientIds = new Set<string>();
  for (const row of customerUsers ?? []) if (row.user_id) recipientIds.add(row.user_id);
  if (customer?.portal_user_id) recipientIds.add(customer.portal_user_id);
  if (!recipientIds.size) return;

  const { error } = await admin.from("notifications").upsert(
    Array.from(recipientIds).map((recipientId) => ({
      recipient_id: recipientId,
      type: "invoice.sent",
      title: "Neue Rechnung",
      body: `Die Rechnung ${invoiceNumber} für ${property.name} wurde erstellt und versendet.`,
      property_id: property.id,
      entity_type: "invoices",
      entity_id: invoiceId,
      idempotency_key: `invoice:${invoiceId}:sent:${recipientId}`,
    })),
    { onConflict: "recipient_id,idempotency_key", ignoreDuplicates: true },
  );
  if (error) throw error;
}

async function reconcileSentInvoice(
  invoiceId: string,
  property: PropertyRow,
  invoiceNumber: string,
  billedAt: string,
  billingMonth: string,
) {
  const admin = createSupabaseAdminClient();
  await markLinkedChargesBilled(invoiceId, billedAt);
  await notifyCustomer(invoiceId, property, invoiceNumber);
  const { data: existingAudit, error: auditLookupError } = await admin
    .from("audit_logs")
    .select("id")
    .eq("action", "invoice.monthly_sent")
    .eq("entity_table", "invoices")
    .eq("entity_id", invoiceId)
    .limit(1)
    .maybeSingle();
  if (auditLookupError) throw auditLookupError;
  if (!existingAudit) {
    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: null,
      action: "invoice.monthly_sent",
      entity_table: "invoices",
      entity_id: invoiceId,
      metadata: { property_id: property.id, billing_month: billingMonth },
    });
    if (auditError) throw auditError;
  }
}

async function processProperty({
  property,
  settings,
  includeMonthlyFee,
  profile,
  company,
  adminIds,
  period,
  issuedOn,
}: {
  property: PropertyRow;
  settings: PropertySettings | null;
  includeMonthlyFee: boolean;
  profile: BillingProfile | null | undefined;
  company: CompanySettings;
  adminIds: string[];
  period: { billingMonth: string; start: string; end: string };
  issuedOn: string;
}): Promise<RunResult> {
  const admin = createSupabaseAdminClient();
  let invoiceId: string | undefined;
  const processingToken = `processing:${crypto.randomUUID()}`;

  try {
    const { data: existing, error: existingError } = await admin
      .from("invoices")
      .select(
        "id,invoice_number,status,error_code,updated_at,original_pdf_bucket,original_pdf_path,original_pdf_sha256,document_content_sha256,issuer_snapshot,recipient_snapshot,bank_snapshot,invoice_date,due_date,title,billing_note,service_period_start,service_period_end",
      )
      .eq("property_id", property.id)
      .eq("billing_month", period.billingMonth)
      .eq("invoice_kind", "regular")
      .maybeSingle();
    if (existingError) throw existingError;
    const existingInvoice = (existing as ExistingInvoice | null) ?? null;
    if (existingInvoice) invoiceId = existingInvoice.id;

    if (
      existingInvoice &&
      ["open", "paid", "overdue"].includes(existingInvoice.status)
    ) {
      await reconcileSentInvoice(
        existingInvoice.id,
        property,
        existingInvoice.invoice_number,
        new Date().toISOString(),
        period.billingMonth,
      );
      return {
        propertyId: property.id,
        status: "skipped",
        invoiceId: existingInvoice.id,
        message: "already sent and reconciled",
      };
    }
    if (existingInvoice?.status === "canceled") {
      return {
        propertyId: property.id,
        status: "skipped",
        invoiceId: existingInvoice.id,
        message: "invoice canceled",
      };
    }

    const { data: charges, error: chargesError } = await admin
      .from("extra_charges")
      .select("id,description,service_date,net_amount_cents,material_cost_cents,tax_rate_bps")
      .eq("property_id", property.id)
      .eq("billable", true)
      .in("billing_status", ["open", "queued"])
      .gte("service_date", period.start)
      .lte("service_date", period.end)
      .order("service_date", { ascending: true });
    if (chargesError) throw chargesError;

    if (includeMonthlyFee && !settings) {
      throw new MonthlyBillingError(
        "required_data",
        "Für den Leistungsmonat ist keine gültige Grundvergütung hinterlegt.",
      );
    }
    const effectiveSettings: PropertySettings = includeMonthlyFee && settings
      ? settings
      : {
          property_id: property.id,
          monthly_fee_net_cents: 0,
          tax_rate_bps: company.default_tax_rate_bps,
        };
    let lines = linesForProperty(
      effectiveSettings,
      (charges ?? []) as ExtraCharge[],
      property.name,
      period,
    );
    let itemRows: InvoiceItemRow[] = [];
    if (existingInvoice) {
      const { data: storedItems, error: storedItemsError } = await admin
        .from("invoice_items")
        .select(
          "id,title,description,quantity,unit,unit_net_cents,total_net_cents,unit_net,total_net,tax_rate_bps,extra_charge_id,service_date",
        )
        .eq("invoice_id", existingInvoice.id)
        .order("sort_order", { ascending: true });
      if (storedItemsError) throw storedItemsError;
      itemRows = (storedItems ?? []) as InvoiceItemRow[];
      if (itemRows.length) lines = linesFromInvoiceItems(itemRows);
    }
    if (!existingInvoice && lines.length === 0) {
      return {
        propertyId: property.id,
        status: "skipped",
        message: "no billable amount",
      };
    }

    const effectiveProfile =
      billingProfileFromSnapshot(
        property.id,
        existingInvoice?.recipient_snapshot ?? null,
      ) ?? profile;
    const profileValidation = validatePropertyBillingProfile(effectiveProfile);
    if (!profileValidation.valid || !effectiveProfile) {
      throw new MonthlyBillingError(
        "required_data",
        `Rechnungsempfänger unvollständig: ${profileValidation.missing.join(", ")}.`,
      );
    }

    const recipient = recipientSnapshot(effectiveProfile);
    const currentSnapshots = issuerSnapshots(company);
    const issuerSnapshot =
      existingInvoice?.issuer_snapshot ?? currentSnapshots.issuerSnapshot;
    const bankSnapshot =
      existingInvoice?.bank_snapshot ?? currentSnapshots.bankSnapshot;
    const pdfIssuer = pdfIssuerFromSnapshots(issuerSnapshot, bankSnapshot);
    const invoiceDate = existingInvoice?.invoice_date ?? issuedOn;
    const dueDate =
      existingInvoice?.due_date ??
      addCalendarDays(invoiceDate, company.payment_due_days);
    const invoiceTitle =
      existingInvoice?.title ??
      `Monatsrechnung ${property.name} · ${period.billingMonth.slice(0, 7)}`;
    const billingNote =
      existingInvoice?.billing_note ??
      `Abrechnung für den Leistungszeitraum ${displayDate(period.start)} bis ${displayDate(period.end)}.`;
    const servicePeriodStart =
      existingInvoice?.service_period_start ?? period.start;
    const servicePeriodEnd = existingInvoice?.service_period_end ?? period.end;
    const totals = calculateBillingTotals(lines);
    if (totals.grossCents <= 0) {
      throw new MonthlyBillingError("zero_invoice", "Nullrechnung wurde blockiert.");
    }
    const taxRates = new Set(lines.map((line) => line.taxRateBps));
    const legacyTaxRateBps =
      taxRates.size === 1
        ? lines[0].taxRateBps
        : company.default_tax_rate_bps;
    const { data: claimRows, error: claimError } = await admin.rpc(
      "claim_monthly_invoice",
      {
        p_customer_id: property.customer_id,
        p_property_id: property.id,
        p_billing_month: period.billingMonth,
        p_issued_on: invoiceDate,
        p_prefix: company.invoice_prefix,
        p_title: invoiceTitle,
        p_due_date: dueDate,
        p_service_period_start: servicePeriodStart,
        p_service_period_end: servicePeriodEnd,
        p_billing_note: billingNote,
        p_net_total_cents: totals.netCents,
        p_tax_total_cents: totals.taxCents,
        p_gross_total_cents: totals.grossCents,
        p_tax_rate_bps: legacyTaxRateBps,
        p_issuer_snapshot: issuerSnapshot,
        p_recipient_snapshot: recipient,
        p_bank_snapshot: bankSnapshot,
        p_processing_token: processingToken,
      },
    );
    const invoiceClaim = (Array.isArray(claimRows)
      ? claimRows[0]
      : claimRows) as InvoiceClaim | null;
    if (claimError || !invoiceClaim) {
      throw claimError ?? new Error("Invoice could not be claimed");
    }
    invoiceId = invoiceClaim.invoice_id;
    if (!invoiceClaim.claimed) {
      if (["open", "paid", "overdue"].includes(invoiceClaim.invoice_status)) {
        await reconcileSentInvoice(
          invoiceClaim.invoice_id,
          property,
          invoiceClaim.invoice_number,
          new Date().toISOString(),
          period.billingMonth,
        );
      }
      return {
        propertyId: property.id,
        status: "skipped",
        invoiceId: invoiceClaim.invoice_id,
        message:
          invoiceClaim.invoice_status === "canceled"
            ? "invoice canceled"
            : "invoice claimed by another run",
      };
    }
    const invoice = {
      id: invoiceClaim.invoice_id,
      invoice_number: invoiceClaim.invoice_number,
      original_pdf_bucket: existingInvoice?.original_pdf_bucket ?? null,
      original_pdf_path: existingInvoice?.original_pdf_path ?? null,
      original_pdf_sha256: existingInvoice?.original_pdf_sha256 ?? null,
      document_content_sha256:
        existingInvoice?.document_content_sha256 ?? null,
    };

    if (!itemRows.length) {
      const { data: insertedItems, error: itemError } = await admin
        .from("invoice_items")
        .insert(
          lines.map((line, index) => ({
            invoice_id: invoice.id,
            title: line.title,
            description: line.description,
            quantity: 1,
            unit: line.unit,
            unit_net_cents: line.netCents,
            total_net_cents: line.netCents,
            unit_net: centsToLegacyAmount(line.netCents),
            total_net: centsToLegacyAmount(line.netCents),
            tax_rate_bps: line.taxRateBps,
            extra_charge_id: line.extraChargeId,
            service_date: line.serviceDate,
            structured_data: {
              kind: line.extraChargeId ? "extra_charge" : "monthly_fee",
              net_amount_cents: line.netCents,
              tax_rate_bps: line.taxRateBps,
            },
            sort_order: index,
          })),
        )
        .select("id,title,description,quantity,unit,unit_net_cents,total_net_cents,unit_net,total_net,tax_rate_bps,extra_charge_id,service_date");
      if (itemError || !insertedItems) throw itemError ?? new Error("Invoice items could not be created");
      itemRows = insertedItems as InvoiceItemRow[];
    }
    lines = linesFromInvoiceItems(itemRows);
    const finalizedTotals = calculateBillingTotals(lines);
    if (
      finalizedTotals.netCents !== totals.netCents ||
      finalizedTotals.taxCents !== totals.taxCents ||
      finalizedTotals.grossCents !== totals.grossCents
    ) {
      throw new MonthlyBillingError(
        "invoice_content_changed",
        "Gespeicherte Rechnungspositionen stimmen nicht mit dem Rechnungskopf überein.",
      );
    }
    const documentContentSha256 = sha256Buffer(
      Buffer.from(
        JSON.stringify({
          invoiceNumber: invoice.invoice_number,
          invoiceDate,
          dueDate,
          servicePeriodStart,
          servicePeriodEnd,
          issuerSnapshot,
          recipient,
          bankSnapshot,
          lines,
          totals: finalizedTotals,
        }),
        "utf8",
      ),
    );

    let pdf: Buffer;
    let pdfSha256: string;
    let pdfBucket = invoice.original_pdf_bucket;
    let pdfPath = invoice.original_pdf_path;
    if (pdfBucket && pdfPath) {
      const { data, error } = await admin.storage.from(pdfBucket).download(pdfPath);
      if (error || !data) throw error ?? new Error("Stored invoice PDF could not be read");
      pdf = Buffer.from(await data.arrayBuffer());
      pdfSha256 = sha256Buffer(pdf);
      if (
        invoice.original_pdf_sha256 &&
        invoice.original_pdf_sha256 !== pdfSha256
      ) {
        throw new MonthlyBillingError(
          "invoice_pdf_integrity",
          "Die gespeicherte Originalrechnung hat eine ungültige Prüfsumme.",
        );
      }
      if (
        invoice.document_content_sha256 &&
        invoice.document_content_sha256 !== documentContentSha256
      ) {
        throw new MonthlyBillingError(
          "invoice_content_integrity",
          "Die strukturierten Rechnungsdaten stimmen nicht mit der Originalrechnung überein.",
        );
      }
    } else {
      const { data: buildings } = await admin
        .from("buildings")
        .select("formatted_address")
        .eq("property_id", property.id)
        .eq("status", "active")
        .order("created_at", { ascending: true });
      const objectAddress = (buildings ?? []).map((building) => building.formatted_address).filter(Boolean).join(" · ");
      pdf = createBusinessDocumentPdf({
        kind: "invoice",
        number: invoice.invoice_number,
        title: `Monatsrechnung ${property.name}`,
        customer: {
          companyName: effectiveProfile.recipient_name,
          addition: effectiveProfile.address_addition,
          email: effectiveProfile.email,
          address: recipient.full_address,
        },
        project: { name: property.name, objectAddress, objectType: null },
        items: lines.map((line, index) => ({
          title: line.title,
          description: `${line.description} · USt. ${(line.taxRateBps / 100).toLocaleString("de-DE")}%`,
          quantity: 1,
          unit: line.unit,
          unitNet: centsToLegacyAmount(line.netCents),
          totalNet: centsToLegacyAmount(line.netCents),
          sortOrder: index,
        })),
        totals: {
          netTotal: centsToLegacyAmount(finalizedTotals.netCents),
          taxRate: lines[0]?.taxRateBps / 100 || company.default_tax_rate_bps / 100,
          taxTotal: centsToLegacyAmount(finalizedTotals.taxCents),
          grossTotal: centsToLegacyAmount(finalizedTotals.grossCents),
        },
        taxBreakdown: calculateTaxBreakdown(lines),
        createdAt: `${invoiceDate}T12:00:00Z`,
        dueDate,
        servicePeriodStart,
        servicePeriodEnd,
        billingNote,
        issuer: pdfIssuer,
      });
      pdfSha256 = sha256Buffer(pdf);
      pdfBucket = "invoice-pdfs";
      pdfPath = `${property.id}/${period.billingMonth.slice(0, 7)}/${safePdfSegment(invoice.invoice_number)}.pdf`;
      const { error: uploadError } = await admin.storage.from(pdfBucket).upload(pdfPath, pdf, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (uploadError) {
        // A previous attempt may have uploaded the immutable file before its
        // database update failed. Reuse those exact bytes instead of replacing it.
        const { data: existingPdf, error: downloadError } = await admin.storage.from(pdfBucket).download(pdfPath);
        if (downloadError || !existingPdf) throw uploadError;
        const existingPdfBytes = Buffer.from(await existingPdf.arrayBuffer());
        if (sha256Buffer(existingPdfBytes) !== pdfSha256) {
          throw new MonthlyBillingError(
            "invoice_pdf_conflict",
            "Für diese Rechnung existiert bereits eine abweichende Originaldatei.",
          );
        }
        pdf = existingPdfBytes;
      }
    }

    if (!pdfBucket || !pdfPath) throw new Error("Invoice PDF path is missing");
    const issuedAt = new Date().toISOString();
    const { data: releasedInvoice, error: releaseError } = await admin
      .from("invoices")
      .update({
        status: "released",
        original_pdf_bucket: pdfBucket,
        original_pdf_path: pdfPath,
        original_pdf_sha256: pdfSha256,
        document_content_sha256: documentContentSha256,
        document_path: pdfPath,
        issued_at: issuedAt,
        released_at: issuedAt,
        error_code: processingToken,
        error_message: null,
      })
      .eq("id", invoice.id)
      .eq("processing_token", processingToken)
      .in("status", ["draft", "released"])
      .select("id")
      .maybeSingle();
    if (releaseError || !releasedInvoice) throw releaseError ?? new Error("Invoice could not be released");

    await sendPortalDocumentEmail({
      to: effectiveProfile.email,
      fromEmail: invoiceFromAddress(company),
      replyTo: company.invoice_email_reply_to || company.email,
      idempotencyKey: `hausvia-monthly-invoice-${invoice.id}`,
      subject: `Ihre Hausvia Rechnung ${invoice.invoice_number}`,
      headline: `Rechnung ${invoice.invoice_number}`,
      intro: `Die Monatsrechnung für ${property.name} wurde erstellt.`,
      note: `Leistungszeitraum: ${displayDate(period.start)} bis ${displayDate(period.end)}. Zahlungsziel: ${displayDate(dueDate)}.`,
      footer: {
        legalName: String(issuerSnapshot.legal_name ?? ""),
        address: String(issuerSnapshot.full_address ?? ""),
        representative:
          typeof issuerSnapshot.management === "string"
            ? issuerSnapshot.management
            : null,
        register:
          typeof issuerSnapshot.commercial_register === "string"
            ? issuerSnapshot.commercial_register
            : null,
        vatId:
          typeof issuerSnapshot.vat_id === "string" ? issuerSnapshot.vat_id : null,
        taxNumber:
          typeof issuerSnapshot.tax_number === "string"
            ? issuerSnapshot.tax_number
            : null,
        phone:
          typeof issuerSnapshot.phone === "string" ? issuerSnapshot.phone : "",
        email: String(issuerSnapshot.email ?? ""),
      },
      attachment: {
        filename: `${safePdfSegment(invoice.invoice_number)}-rechnung-hausvia.pdf`,
        content: pdf.toString("base64"),
      },
    });

    const sentAt = new Date().toISOString();
    const { data: sentInvoice, error: sentError } = await admin
      .from("invoices")
      .update({
        status: "open",
        sent_at: sentAt,
        error_code: null,
        error_message: null,
        processing_token: null,
        processing_started_at: null,
      })
      .eq("id", invoice.id)
      .eq("status", "released")
      .eq("processing_token", processingToken)
      .select("id")
      .maybeSingle();
    if (sentError || !sentInvoice) throw sentError ?? new Error("Invoice status could not be finalized");

    await reconcileSentInvoice(
      invoice.id,
      property,
      invoice.invoice_number,
      sentAt,
      period.billingMonth,
    );

    return { propertyId: property.id, status: "sent", invoiceId: invoice.id };
  } catch (error) {
    const code = error instanceof MonthlyBillingError ? error.code : "billing_failed";
    const message = error instanceof Error ? error.message.slice(0, 1_000) : "Unbekannter Abrechnungsfehler";
    if (invoiceId) {
      await admin
        .from("invoices")
        .update({
          error_code: code,
          error_message: message,
          processing_token: null,
          processing_started_at: null,
        })
        .eq("id", invoiceId)
        .eq("processing_token", processingToken)
        .in("status", ["draft", "released"]);
    }
    try {
      await notifyAdmins({
        adminIds,
        type: "invoice.error",
        title: "Monatsrechnung konnte nicht erstellt oder versendet werden",
        body: `${property.name}: ${message}`,
        propertyId: property.id,
        entityType: invoiceId ? "invoices" : "properties",
        entityId: invoiceId ?? property.id,
        idempotencyKey: `billing:${period.billingMonth}:${property.id}:error:${code}`,
      });
    } catch (notificationError) {
      console.error("[Hausvia Billing] Admin notification failed", notificationError);
    }
    return { propertyId: property.id, status: "failed", invoiceId, message: code };
  }
}

async function runMonthlyBilling(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const admin = createSupabaseAdminClient();
  const period = previousBerlinBillingPeriod(now);
  const issuedOn = berlinIsoDate(now);

  const [{ data: adminProfiles }, { data: company, error: companyError }] = await Promise.all([
    admin.from("user_profiles").select("id").eq("role", "admin").eq("status", "active"),
    admin.from("company_settings").select("*").eq("id", true).maybeSingle(),
  ]);
  const adminIds = (adminProfiles ?? []).map((profile) => profile.id as string);
  if (companyError) {
    return NextResponse.json({ ok: false, message: "Company settings could not be loaded" }, { status: 500 });
  }

  const companyValidation = validateCompanySettings(company);
  if (!companyValidation.valid) {
    await notifyAdmins({
      adminIds,
      type: "invoice.error",
      title: "Monatsabrechnung blockiert",
      body: `Bitte ergänzen Sie die Unternehmenseinstellungen: ${companyValidation.missing.join(", ")}.`,
      entityType: "company_settings",
      idempotencyKey: `billing:${period.billingMonth}:company-settings`,
    });
    return NextResponse.json({ ok: true, blocked: true, reason: "company settings incomplete" });
  }

  const { data: properties, error: propertiesError } = await admin
    .from("properties")
    .select("id,customer_id,name,status,care_start_date,care_end_date,archived_at")
    .in("status", ["active", "paused", "archived"])
    .order("id", { ascending: true });
  if (propertiesError) {
    return NextResponse.json({ ok: false, message: "Properties could not be loaded" }, { status: 500 });
  }

  const propertyIds = (properties ?? []).map((property) => property.id as string);
  if (!propertyIds.length) return NextResponse.json({ ok: true, period, results: [] });
  const [compensationRatesResult, billingProfilesResult] = await Promise.all([
    admin
      .from("property_compensation_rates")
      .select("property_id,net_amount_cents,tax_rate_bps,valid_from,valid_until")
      .in("property_id", propertyIds),
    admin.from("property_billing_profiles").select("*").in("property_id", propertyIds),
  ]);
  if (compensationRatesResult.error || billingProfilesResult.error) {
    return NextResponse.json({ ok: false, message: "Billing configuration could not be loaded" }, { status: 500 });
  }
  const billingProfiles = billingProfilesResult.data;
  const ratesByProperty = new Map<string, CompensationRate[]>();
  for (const rate of (compensationRatesResult.data ?? []) as Array<{
    property_id: string;
    net_amount_cents: number;
    tax_rate_bps: number;
    valid_from: string;
    valid_until: string | null;
  }>) {
    const rates = ratesByProperty.get(rate.property_id) ?? [];
    rates.push({
      property_id: rate.property_id,
      net_amount_cents: rate.net_amount_cents,
      tax_rate_bps: rate.tax_rate_bps,
      valid_from: rate.valid_from,
      valid_until: rate.valid_until,
    });
    ratesByProperty.set(rate.property_id, rates);
  }
  const profileByProperty = new Map(
    ((billingProfiles ?? []) as BillingProfile[]).map((profile) => [profile.property_id, profile]),
  );
  const results: RunResult[] = [];

  for (const property of (properties ?? []) as PropertyRow[]) {
    const includeMonthlyFee = carePeriodOverlapsBillingPeriod(property, period);
    const selectedRate = includeMonthlyFee
      ? selectCompensationRateForPeriod(
          ratesByProperty.get(property.id) ?? [],
          period,
          property.care_start_date,
        )
      : null;
    const settings = selectedRate
      ? {
          property_id: selectedRate.property_id,
          monthly_fee_net_cents: selectedRate.net_amount_cents,
          tax_rate_bps: selectedRate.tax_rate_bps,
        }
      : null;
    const profile = profileByProperty.get(property.id);

    results.push(
      await processProperty({
        property,
        settings,
        includeMonthlyFee,
        profile,
        company: company as CompanySettings,
        adminIds,
        period,
        issuedOn,
      }),
    );
  }

  return NextResponse.json({
    ok: results.every((result) => result.status !== "failed"),
    period,
    results,
  });
}

export async function GET(request: Request) {
  return runMonthlyBilling(request);
}

export async function POST(request: Request) {
  return runMonthlyBilling(request);
}
