"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/supabase/auth";

const retiredMessage =
  "Die frühere Schicht- und Materialerfassung wurde durch sichere Einsätze und betriebliche Meldungen ersetzt.";

async function redirectToCurrentVisitFlow(): Promise<never> {
  await requireProfile(["employee"]);
  redirect(`/app/today?error=${encodeURIComponent(retiredMessage)}`);
}

/** @deprecated Neue Arbeitszeiten werden ausschließlich über den serverseitigen Einsatz-Timer erfasst. */
export async function startShiftAction() {
  return redirectToCurrentVisitFlow();
}

/** @deprecated Neue Arbeitszeiten werden ausschließlich über den serverseitigen Einsatz-Timer erfasst. */
export async function submitShiftAction() {
  return redirectToCurrentVisitFlow();
}

/** @deprecated Material- und Equipmentbedarf wird als betriebliche Meldung am Einsatz erfasst. */
export async function createMaterialRequestAction() {
  return redirectToCurrentVisitFlow();
}
