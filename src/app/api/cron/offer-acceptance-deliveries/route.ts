import { NextResponse } from "next/server";
import { processOfferAcceptanceDelivery } from "@/lib/offerAcceptanceDelivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

async function processDeliveries(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  let delivered = 0;
  let failed = 0;
  for (let index = 0; index < 10; index += 1) {
    try {
      const result = await processOfferAcceptanceDelivery();
      if (!result.processed) break;
      delivered += 1;
    } catch (error) {
      failed += 1;
      console.error("[Hausvia Offer] Scheduled acceptance delivery failed", error);
    }
  }

  return NextResponse.json({ ok: failed === 0, delivered, failed }, { status: failed ? 207 : 200 });
}

export async function GET(request: Request) {
  return processDeliveries(request);
}

export async function POST(request: Request) {
  return processDeliveries(request);
}
