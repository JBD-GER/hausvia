import assert from "node:assert/strict";
import test from "node:test";
import {
  GET,
  POST,
} from "../app/api/billing/run-cycles/route.ts";

test("alte Abrechnungsroute antwortet für GET und POST unabhängig von Auth mit 410", async () => {
  for (const response of [
    await GET(),
    await POST(
      new Request("https://hausvia.de/api/billing/run-cycles", {
        method: "POST",
        headers: { authorization: "Bearer beliebig" },
      }),
    ),
  ]) {
    assert.equal(response.status, 410);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      ok: false,
      code: "billing_cycle_route_retired",
      message: "Diese Abrechnungsroute wurde dauerhaft stillgelegt.",
    });
  }
});
