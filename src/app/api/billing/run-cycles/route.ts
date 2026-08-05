export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function retiredBillingCycleResponse() {
  return Response.json(
    {
      ok: false,
      code: "billing_cycle_route_retired",
      message: "Diese Abrechnungsroute wurde dauerhaft stillgelegt.",
    },
    {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function GET() {
  return retiredBillingCycleResponse();
}

export async function POST() {
  return retiredBillingCycleResponse();
}
