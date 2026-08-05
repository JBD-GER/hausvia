import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getInvoiceDocument } from "@/lib/portalDocuments";
import { canRoleDownloadInvoice } from "@/lib/invoiceIntegrity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile || !canRoleDownloadInvoice(profile.role)) {
    return NextResponse.json({ ok: false, message: "Document not found" }, { status: 404 });
  }
  const supabase = await createSupabaseServerClient();

  try {
    const { data: authorizedInvoice, error: authorizationError } = await supabase
      .from("invoices")
      .select("id,invoice_number")
      .eq("id", id)
      .maybeSingle();
    if (authorizationError || !authorizedInvoice) {
      throw authorizationError ?? new Error("Invoice access denied");
    }

    // The RLS-protected lookup above is the authorization boundary. Sensitive
    // storage paths and legacy invoice data are read only afterwards, server-side.
    const admin = createSupabaseAdminClient();
    const { data: invoice, error: invoiceError } = await admin
      .from("invoices")
      .select(
        "invoice_number,original_pdf_bucket,original_pdf_path,original_pdf_sha256",
      )
      .eq("id", id)
      .single();
    if (invoiceError || !invoice) {
      throw invoiceError ?? new Error("Invoice not found");
    }

    if (invoice?.original_pdf_bucket && invoice.original_pdf_path) {
      const { data, error } = await admin.storage
        .from(invoice.original_pdf_bucket)
        .download(invoice.original_pdf_path);
      if (error || !data) throw error ?? new Error("Stored invoice not found");
      const bytes = Buffer.from(await data.arrayBuffer());
      if (
        invoice.original_pdf_sha256 &&
        createHash("sha256").update(bytes).digest("hex") !==
          invoice.original_pdf_sha256
      ) {
        throw new Error("Stored invoice integrity check failed");
      }
      const safeNumber = String(invoice.invoice_number || "rechnung")
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${safeNumber || "rechnung"}-hausvia.pdf"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const document = await getInvoiceDocument(admin, id);
    return new NextResponse(document.pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${document.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, message: "Document not found" }, { status: 404 });
  }
}
