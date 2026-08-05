import { NextResponse } from "next/server";
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
    { ok: false, message: "Offer not found" },
    { status: 404, headers: responseHeaders },
  );
}

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (
    !profile ||
    profile.role !== "customer" ||
    profile.status !== "active" ||
    !profile.onboarding_completed
  ) {
    return notFoundResponse();
  }

  const supabase = await createSupabaseServerClient();
  const { data: version, error: versionError } = await supabase
    .from("offer_versions")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (versionError || !version) return notFoundResponse();

  const { data, error } = await supabase.rpc("mark_offer_viewed", {
    p_offer_version_id: id,
  });
  if (error) return notFoundResponse();

  return NextResponse.json(
    { ok: true, result: data },
    { headers: responseHeaders },
  );
}
