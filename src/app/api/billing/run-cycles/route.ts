import { NextResponse } from "next/server";
import { createDocumentNumber, dueDateBeforePeriodStart, monthPeriodFromStart, nextMonthAfter, nextServiceMonth } from "@/lib/commerce";
import { sendPortalDocumentEmail } from "@/lib/mail";
import { getInvoiceDocument } from "@/lib/portalDocuments";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CycleOfferItem = {
  title: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_net: number;
  total_net: number;
  sort_order: number | null;
};

type CycleRow = {
  id: string;
  title: string;
  customer_id: string;
  project_id: string | null;
  offer_id: string | null;
  amount_net: number;
  tax_rate: number;
  tax_total: number;
  amount_gross: number;
  billing_in_advance: boolean;
  generate_days_before_month_end: number;
  next_period_start: string | null;
  offers: { offer_items: CycleOfferItem[] | null } | { offer_items: CycleOfferItem[] | null }[] | null;
};

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function firstOffer(value: CycleRow["offers"]) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized or CRON_SECRET missing" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: cycles, error } = await admin
    .from("invoice_cycles")
    .select("id,title,customer_id,project_id,offer_id,amount_net,tax_rate,tax_total,amount_gross,billing_in_advance,generate_days_before_month_end,next_period_start,offers(offer_items(title,description,quantity,unit,unit_net,total_net,sort_order))")
    .eq("status", "active");

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  const results: Array<{ cycleId: string; status: string; invoiceId?: string; message?: string }> = [];

  for (const cycle of (cycles ?? []) as CycleRow[]) {
    const period = monthPeriodFromStart(cycle.next_period_start || nextServiceMonth().start);
    const dueDate = dueDateBeforePeriodStart(period.start, cycle.generate_days_before_month_end || 15);

    if (dueDate > today) {
      results.push({ cycleId: cycle.id, status: "skipped", message: `not due before ${dueDate}` });
      continue;
    }

    try {
      const { data: existingInvoice } = await admin
        .from("invoices")
        .select("id,status")
        .eq("invoice_cycle_id", cycle.id)
        .eq("service_period_start", period.start)
        .maybeSingle();

      if (existingInvoice?.id) {
        if (existingInvoice.status === "released") {
          await admin
            .from("invoice_cycles")
            .update({ next_period_start: nextMonthAfter(period.start), last_generated_at: new Date().toISOString() })
            .eq("id", cycle.id);
        }
        results.push({ cycleId: cycle.id, status: "skipped", invoiceId: existingInvoice.id, message: "invoice already exists" });
        continue;
      }

      const { data: invoice } = await admin
        .from("invoices")
        .insert({
          customer_id: cycle.customer_id,
          project_id: cycle.project_id,
          source_offer_id: cycle.offer_id,
          invoice_cycle_id: cycle.id,
          invoice_number: createDocumentNumber("RE", cycle.id),
          title: cycle.title,
          due_date: dueDate,
          net_total: cycle.amount_net,
          tax_rate: cycle.tax_rate,
          tax_total: cycle.tax_total,
          gross_total: cycle.amount_gross,
          service_period_start: period.start,
          service_period_end: period.end,
          billing_note: cycle.billing_in_advance
            ? `Diese Rechnung betrifft den kommenden Leistungsmonat ${period.start} bis ${period.end}. Die Zahlung vor Leistungsbeginn wurde vereinbart.`
            : `Diese Rechnung betrifft den Leistungszeitraum ${period.start} bis ${period.end}.`,
          status: "draft",
        })
        .select("id")
        .single();

      if (!invoice?.id) {
        results.push({ cycleId: cycle.id, status: "failed", message: "invoice insert failed" });
        continue;
      }

      const offer = firstOffer(cycle.offers);
      const items = Array.isArray(offer?.offer_items) ? offer.offer_items : [];
      await admin.from("invoice_items").insert(
        items.map((item) => ({
          invoice_id: invoice.id,
          title: item.title,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_net: item.unit_net,
          total_net: item.total_net,
          sort_order: item.sort_order ?? 0,
        })),
      );

      const document = await getInvoiceDocument(admin, invoice.id);
      if (document.customerEmail) {
        await sendPortalDocumentEmail({
          to: document.customerEmail,
          subject: `Ihre Hausvia Rechnung ${document.number}`,
          headline: "Ihre Hausvia Rechnung ist erstellt",
          intro: "Ihre regelmäßige Rechnung wurde erstellt. Das Dokument befindet sich im Anhang und ist zusätzlich in Ihrem Hausvia Portal sichtbar.",
          note: "Diese Rechnung bezieht sich auf den kommenden Leistungsmonat. Bitte beachten Sie das Fälligkeitsdatum im Dokument.",
          attachment: {
            filename: document.filename,
            content: document.pdf.toString("base64"),
          },
        });
      }

      await admin
        .from("invoices")
        .update({
          status: "released",
          released_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
          document_path: `generated://invoices/${invoice.id}.pdf`,
        })
        .eq("id", invoice.id);

      await admin
        .from("invoice_cycles")
        .update({
          next_period_start: nextMonthAfter(period.start),
          last_generated_at: new Date().toISOString(),
        })
        .eq("id", cycle.id);

      results.push({ cycleId: cycle.id, status: "sent", invoiceId: invoice.id });
    } catch (cycleError) {
      results.push({
        cycleId: cycle.id,
        status: "failed",
        message: cycleError instanceof Error ? cycleError.message : "unknown error",
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}

export async function GET(request: Request) {
  return POST(request);
}
