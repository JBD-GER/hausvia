import { NextResponse } from "next/server";
import {
  getOfferAcceptanceConfirmationDocument,
  offerAcceptanceFileName,
} from "@/lib/offerDocuments";
import { canRoleDownloadOffer, verifyOfferPdfSha256 } from "@/lib/offerIntegrity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

function notFoundResponse() {
  return NextResponse.json(
    { ok: false, message: "Document not found" },
    { status: 404, headers: responseHeaders },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const requestedVersionId = new URL(request.url).searchParams.get("version");
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== "active" || !canRoleDownloadOffer(profile.role)) {
    return notFoundResponse();
  }
  const supabase = await createSupabaseServerClient();

  try {
    // Authorization intentionally happens through RLS before any privileged
    // Storage or snapshot read.
    let acceptanceId = id;
    if (requestedVersionId) {
      const { data: authorizedVersion, error: versionAuthorizationError } = await supabase
        .from("offer_versions")
        .select("id,offer_id")
        .eq("id", requestedVersionId)
        .maybeSingle();
      if (versionAuthorizationError || !authorizedVersion || authorizedVersion.offer_id !== id) {
        throw versionAuthorizationError ?? new Error("Offer version access denied");
      }
      const { data: versionAcceptance, error: versionAcceptanceError } = await supabase
        .from("offer_acceptances")
        .select("id")
        .eq("offer_version_id", requestedVersionId)
        .maybeSingle();
      if (versionAcceptanceError || !versionAcceptance) {
        throw versionAcceptanceError ?? new Error("Acceptance access denied");
      }
      acceptanceId = versionAcceptance.id;
    }

    const { data: authorizedAcceptance, error: authorizationError } = await supabase
      .from("offer_acceptances")
      .select("id")
      .eq("id", acceptanceId)
      .maybeSingle();
    if (authorizationError || !authorizedAcceptance) {
      throw authorizationError ?? new Error("Acceptance access denied");
    }

    const admin = createSupabaseAdminClient();
    const { data: acceptance, error: acceptanceError } = await admin
      .from("offer_acceptances")
      .select("id,offer_version_id,confirmation_pdf_bucket,confirmation_pdf_path,confirmation_pdf_sha256")
      .eq("id", acceptanceId)
      .single();
    if (acceptanceError || !acceptance) {
      throw acceptanceError ?? new Error("Acceptance not found");
    }

    const { data: version, error: versionError } = await admin
      .from("offer_versions")
      .select("offer_number,version_number")
      .eq("id", acceptance.offer_version_id)
      .single();
    if (versionError || !version) throw versionError ?? new Error("Offer version not found");

    if (acceptance.confirmation_pdf_path) {
      if (
        acceptance.confirmation_pdf_bucket !== "offer-pdfs" ||
        !acceptance.confirmation_pdf_sha256 ||
        !/^[0-9a-f]{64}$/.test(acceptance.confirmation_pdf_sha256)
      ) {
        throw new Error("Invalid acceptance document reference");
      }
      const { data, error } = await admin.storage
        .from(acceptance.confirmation_pdf_bucket)
        .download(acceptance.confirmation_pdf_path);
      if (error || !data) throw error ?? new Error("Stored acceptance document not found");
      const bytes = Buffer.from(await data.arrayBuffer());
      if (!verifyOfferPdfSha256(bytes, acceptance.confirmation_pdf_sha256)) {
        throw new Error("Stored acceptance document integrity check failed");
      }
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          ...responseHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${offerAcceptanceFileName(version.offer_number, version.version_number)}"`,
        },
      });
    }

    const document = await getOfferAcceptanceConfirmationDocument(admin, acceptanceId);
    return new NextResponse(new Uint8Array(document.pdf), {
      headers: {
        ...responseHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${document.filename}"`,
      },
    });
  } catch {
    return notFoundResponse();
  }
}
