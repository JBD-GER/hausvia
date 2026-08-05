import { redirect } from "next/navigation";

export default function InvalidDamageLinkPage() {
  redirect("/meldung/nicht-verfuegbar");
}
