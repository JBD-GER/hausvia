import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

async function generateVisits(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("generate_upcoming_visits", {
    p_horizon_days: 90,
    p_plan_id: null,
  });
  if (error) {
    return NextResponse.json({ ok: false, message: "Visit generation failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, horizonDays: 90, generated: Number(data ?? 0) });
}

export async function GET(request: Request) {
  return generateVisits(request);
}

export async function POST(request: Request) {
  return generateVisits(request);
}
