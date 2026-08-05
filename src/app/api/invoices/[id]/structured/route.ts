import { NextResponse } from "next/server";
import { buildStructuredInvoiceExport } from "@/lib/invoiceStructuredExport";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin" || profile.status !== "active") {
    return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();
  const [{ data: invoice, error: invoiceError }, { data: items, error: itemsError }] =
    await Promise.all([
      admin
        .from("invoices")
        .select(
          "id,invoice_number,invoice_kind,status,title,invoice_date,due_date,billing_month,service_period_start,service_period_end,billing_note,net_total_cents,tax_total_cents,gross_total_cents,issuer_snapshot,recipient_snapshot,bank_snapshot,immutable_at,document_content_sha256,original_pdf_sha256",
        )
        .eq("id", id)
        .maybeSingle(),
      admin
        .from("invoice_items")
        .select(
          "id,title,description,quantity,unit,unit_net_cents,total_net_cents,tax_rate_bps,service_date,structured_data,sort_order",
        )
        .eq("invoice_id", id)
        .order("sort_order", { ascending: true }),
    ]);
  if (invoiceError || itemsError || !invoice) {
    return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });
  }

  try {
    const body = buildStructuredInvoiceExport(invoice, items ?? []);
    const filename = String(invoice.invoice_number || invoice.id)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${filename || "rechnung"}-strukturiert.json"`,
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "Structured invoice data is incomplete" },
      { status: 409 },
    );
  }
}
