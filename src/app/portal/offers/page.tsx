import { acceptOfferAction } from "@/app/actions/customer";
import Link from "next/link";
import { EmptyState, Field, PageHeader, Panel, StatusPill, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { asText, formatEuro } from "@/lib/portal/format";
import { requireProfile } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CustomerOffersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const profile = await requireProfile(["customer"]);
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: customer } = await supabase.from("customers").select("id").eq("portal_user_id", profile.id).maybeSingle();
  const { data: offers } = customer
    ? await supabase.from("offers").select("id,status,title,intro,net_total,tax_total,gross_total,offer_items(title,description,quantity,unit,total_net)").eq("customer_id", customer.id).order("created_at", { ascending: false })
    : { data: [] };

  return (
    <>
      <PageHeader eyebrow="Angebote" title="Ihre Angebote" text="Nur von Hausvia freigegebene Angebote sind hier sichtbar." />
      {params.status === "accepted" ? (
        <p className="mb-5 rounded-md border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-800">
          Vielen Dank. Das Angebot wurde angenommen und Hausvia wurde informiert.
        </p>
      ) : null}
      <Panel title="Freigegebene Angebote">
        {offers?.length ? (
          <div className="grid gap-5">
            {offers.map((offer) => (
              <article key={offer.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold text-slate-950">{offer.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-650">{asText(offer.intro)}</p>
                  </div>
                  <StatusPill>{offer.status}</StatusPill>
                </div>
                <div className="mt-4 rounded-lg bg-white p-4">
                  {(offer.offer_items ?? []).map((item: { title: string; description: string | null; quantity: number; unit: string; total_net: number }) => (
                    <div key={item.title} className="border-b border-slate-100 py-3 last:border-0">
                      <p className="font-bold text-slate-950">{item.title}</p>
                      <p className="text-sm text-slate-650">{asText(item.description)} · {item.quantity} {item.unit}</p>
                      <p className="text-sm font-bold text-slate-900">{formatEuro(item.total_net)} netto</p>
                    </div>
                  ))}
                  <p className="mt-4 text-right text-2xl font-extrabold text-slate-950">{formatEuro(offer.gross_total)} brutto</p>
                </div>
                <Link href={`/api/documents/offers/${offer.id}`} className={`${buttonClass} mt-4`}>
                  Angebot als PDF öffnen
                </Link>
                {offer.status === "released" ? (
                  <form action={acceptOfferAction} className="mt-4 grid gap-4 rounded-lg border border-brand/15 bg-white p-4">
                    <input type="hidden" name="offerId" value={offer.id} />
                    <Field label="Name für Annahme"><input name="signatureName" required className={inputClass} /></Field>
                    <Field label="Digitale Unterschrift"><input name="signature" required className={inputClass} placeholder="Bitte Namen als digitale Signatur eingeben" /></Field>
                    <label className="flex gap-3 text-sm font-semibold leading-6 text-slate-700">
                      <input type="checkbox" name="confirmed" required className="mt-1 h-5 w-5 rounded border-slate-300 text-brand focus:ring-brand" />
                      Ich bestätige die Annahme dieses Angebots verbindlich und stimme der digitalen Speicherung mit Zeitstempel zu.
                    </label>
                    <button className={buttonClass}>Angebot annehmen</button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="Keine Angebote" text="Sobald Hausvia ein Angebot freigibt, erscheint es hier." />
        )}
      </Panel>
    </>
  );
}
