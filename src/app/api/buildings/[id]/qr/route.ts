import QRCode from "qrcode";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/supabase/config";
import { deriveBuildingQrToken } from "@/lib/portal/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Nicht angemeldet", { status: 401 });
  if (profile.role !== "admin" || profile.status !== "active" || !profile.onboarding_completed) {
    return new Response("Nicht erlaubt", { status: 403 });
  }
  const { id } = await context.params;
  const admin = createSupabaseAdminClient();
  const { data: building } = await admin
    .from("buildings")
    .select("id,label,formatted_address,qr_token_nonce,status")
    .eq("id", id)
    .maybeSingle();
  if (!building || !building.qr_token_nonce || building.status !== "active") return new Response("Gebäude nicht gefunden", { status: 404 });
  const token = deriveBuildingQrToken(building.id, building.qr_token_nonce);
  const url = `${siteUrl}/meldung/${token}`;
  const format = new URL(request.url).searchParams.get("format");
  if (format === "svg") {
    const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "H", margin: 2, color: { dark: "#082b61", light: "#ffffff" } });
    return new Response(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="hausvia-qr-${building.id}.svg"` } });
  }
  const png = await QRCode.toBuffer(url, { type: "png", width: 1024, errorCorrectionLevel: "H", margin: 3, color: { dark: "#082b61", light: "#ffffff" } });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="hausvia-qr-${building.id}.png"` } });
}
