import { NextResponse } from "next/server";
import { getOfferDocument } from "@/lib/portalDocuments";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  try {
    const document = await getOfferDocument(supabase, id);
    return new NextResponse(document.pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${document.filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ ok: false, message: "Document not found" }, { status: 404 });
  }
}
