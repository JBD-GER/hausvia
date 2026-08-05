import { NextResponse } from "next/server";
import {
  getOfferVersionDocument,
  offerDocumentFileName,
} from "@/lib/offerDocuments";
import { canRoleDownloadOffer, verifyOfferPdfSha256 } from "@/lib/offerIntegrity";
import { getOfferDocument } from "@/lib/portalDocuments";
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

function pdfResponse(bytes: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      ...responseHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}

function isLegacySnapshot(value: unknown) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).source === "legacy-backfill",
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
    // This RLS-protected lookup is the authorization boundary. Only after it
    // succeeds may the server use its service credential for private Storage.
    const { data: directVersion, error: directVersionError } = await supabase
      .from("offer_versions")
      .select("id,offer_id")
      .eq("id", requestedVersionId || id)
      .maybeSingle();
    if (directVersionError) throw directVersionError;

    if (requestedVersionId && directVersion && directVersion.offer_id !== id) {
      throw new Error("Offer version does not belong to offer");
    }

    let offerVersionId = directVersion?.id ?? null;
    let authorizedLegacyOfferId: string | null = null;

    if (!offerVersionId && !requestedVersionId) {
      const { data: offer, error: offerError } = await supabase
        .from("offers")
        .select("id,active_version_id,current_version_id")
        .eq("id", id)
        .maybeSingle();
      if (offerError || !offer) throw offerError ?? new Error("Offer access denied");
      offerVersionId = offer.active_version_id || offer.current_version_id || null;
      authorizedLegacyOfferId = offer.id;
    }

    if (requestedVersionId && !offerVersionId) throw new Error("Offer version access denied");

    const admin = createSupabaseAdminClient();
    if (!offerVersionId) {
      if (!authorizedLegacyOfferId) throw new Error("Offer not found");
      const legacyDocument = await getOfferDocument(admin, authorizedLegacyOfferId);
      return pdfResponse(legacyDocument.pdf, legacyDocument.filename);
    }

    const { data: version, error: versionError } = await admin
      .from("offer_versions")
      .select("id,offer_number,version_number,calculation_snapshot,original_pdf_bucket,original_pdf_path,original_pdf_sha256")
      .eq("id", offerVersionId)
      .single();
    if (versionError || !version) throw versionError ?? new Error("Offer version not found");

    if (version.original_pdf_path) {
      if (
        version.original_pdf_bucket !== "offer-pdfs" ||
        !version.original_pdf_sha256 ||
        !/^[0-9a-f]{64}$/.test(version.original_pdf_sha256)
      ) {
        throw new Error("Invalid original offer reference");
      }
      const { data, error } = await admin.storage
        .from(version.original_pdf_bucket)
        .download(version.original_pdf_path);
      if (error || !data) throw error ?? new Error("Stored offer not found");
      const bytes = Buffer.from(await data.arrayBuffer());
      if (!verifyOfferPdfSha256(bytes, version.original_pdf_sha256)) {
        throw new Error("Stored offer integrity check failed");
      }
      return pdfResponse(
        bytes,
        offerDocumentFileName(version.offer_number, version.version_number),
      );
    }

    // New versions must always be served from their sealed original. Dynamic
    // rendering exists solely for imported legacy documents without an archive.
    if (!isLegacySnapshot(version.calculation_snapshot)) {
      throw new Error("Sealed offer original missing");
    }
    const document = await getOfferVersionDocument(admin, offerVersionId);
    return pdfResponse(document.pdf, document.filename);
  } catch {
    return notFoundResponse();
  }
}
