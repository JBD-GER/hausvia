import QRCode from "qrcode";
import { deriveBuildingQrToken, safeHashEquals } from "@/lib/portal/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { siteUrl } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

function statusResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      ...responseHeaders,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function hasQrConfiguration() {
  return Boolean(process.env.QR_TOKEN_SECRET && process.env.QR_TOKEN_SECRET.length >= 32);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) return statusResponse("Nicht angemeldet", 401);
  if (
    profile.role !== "admin" ||
    profile.status !== "active" ||
    !profile.onboarding_completed
  ) {
    return statusResponse("Nicht erlaubt", 403);
  }

  const { id } = await context.params;
  if (!isUuid(id)) return statusResponse("Gebäude nicht gefunden", 404);

  const admin = createSupabaseAdminClient();
  const { data: building, error } = await admin
    .from("buildings")
    .select(
      "id,label,formatted_address,qr_token_nonce,qr_token_hash,status,properties!inner(status)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return statusResponse("Der QR-Code konnte nicht geladen werden.", 500);
  }
  if (!building) return statusResponse("Gebäude nicht gefunden", 404);

  const property = Array.isArray(building.properties)
    ? building.properties[0]
    : building.properties;
  if (building.status !== "active" || property?.status !== "active") {
    return statusResponse(
      "Der QR-Code ist erst verfügbar, wenn Immobilie und Gebäude aktiv sind.",
      409,
    );
  }
  if (!building.qr_token_nonce || !building.qr_token_hash) {
    return statusResponse(
      "Für dieses Gebäude muss der QR-Code einmal neu erzeugt werden.",
      409,
    );
  }
  if (!hasQrConfiguration()) {
    return statusResponse(
      "Die QR-Code-Funktion ist noch nicht vollständig konfiguriert.",
      503,
    );
  }

  let token: string;
  try {
    token = deriveBuildingQrToken(building.id, building.qr_token_nonce);
  } catch {
    return statusResponse(
      "Die QR-Code-Funktion ist noch nicht vollständig konfiguriert.",
      503,
    );
  }

  if (!safeHashEquals(token, building.qr_token_hash)) {
    return statusResponse(
      "Dieser QR-Code muss im Adminportal einmal widerrufen und erneuert werden.",
      409,
    );
  }

  const requestUrl = new URL(request.url);
  const format = requestUrl.searchParams.get("format") === "svg" ? "svg" : "png";
  const disposition = requestUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  let publicUrl: string;
  try {
    publicUrl = new URL(`/meldung/${encodeURIComponent(token)}`, siteUrl).toString();
  } catch {
    return statusResponse(
      "Die öffentliche Website-Adresse für QR-Codes ist noch nicht korrekt konfiguriert.",
      503,
    );
  }
  const filename = `hausvia-qr-${building.id}.${format}`;

  try {
    if (format === "svg") {
      const svg = await QRCode.toString(publicUrl, {
        type: "svg",
        errorCorrectionLevel: "H",
        margin: 2,
        color: { dark: "#082b61", light: "#ffffff" },
      });
      return new Response(svg, {
        headers: {
          ...responseHeaders,
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Content-Disposition": `${disposition}; filename="${filename}"`,
        },
      });
    }

    const png = await QRCode.toBuffer(publicUrl, {
      type: "png",
      width: 1024,
      errorCorrectionLevel: "H",
      margin: 3,
      color: { dark: "#082b61", light: "#ffffff" },
    });
    return new Response(new Uint8Array(png), {
      headers: {
        ...responseHeaders,
        "Content-Type": "image/png",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
      },
    });
  } catch {
    return statusResponse("Der QR-Code konnte nicht erzeugt werden.", 500);
  }
}
