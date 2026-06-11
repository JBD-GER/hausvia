import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { SEOJsonLd } from "@/components/SEOJsonLd";
import { SITE } from "@/lib/site";
import { breadcrumbSchema, graph, metadataForPage, webPageSchema } from "@/lib/seo";

export const metadata: Metadata = metadataForPage({
  title: "Impressum | Hausvia",
  description:
    "Impressum von Hausvia mit Anbieterkennzeichnung, Kontaktdaten, Registerangaben und Umsatzsteuer-ID.",
  path: "/impressum",
});

export default function ImpressumPage() {
  return (
    <main>
      <Breadcrumbs
        items={[
          { label: "Startseite", href: "/" },
          { label: "Impressum", href: "/impressum" },
        ]}
      />
      <section className="bg-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <p className="text-sm font-bold uppercase tracking-wide text-brand">Anbieterkennzeichnung</p>
          <h1 className="mt-3 text-4xl font-extrabold text-slate-950">Impressum</h1>
          <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
            Hinweis: Die Pflichtangaben wurden übernommen und sollten vor Veröffentlichung final rechtlich geprüft
            werden.
          </p>

          <div className="mt-10 grid gap-6">
            <section className="rounded-lg border border-slate-200 bg-slate-50 p-6">
              <h2 className="text-2xl font-extrabold text-slate-950">Angaben gemäß § 5 TMG</h2>
              <div className="mt-4 space-y-2 text-sm leading-6 text-slate-750">
                <p>{SITE.legalName}</p>
                <p>{SITE.address}</p>
                <p>Vertreten durch: {SITE.representative}</p>
                <p>Marke / Website: Hausvia</p>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-slate-50 p-6">
              <h2 className="text-2xl font-extrabold text-slate-950">Kontakt</h2>
              <div className="mt-4 space-y-2 text-sm leading-6 text-slate-750">
                <p>Telefon: {SITE.phone}</p>
                <p>E-Mail: {SITE.email}</p>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-slate-50 p-6">
              <h2 className="text-2xl font-extrabold text-slate-950">Register, Umsatzsteuer und Aufsicht</h2>
              <div className="mt-4 space-y-2 text-sm leading-6 text-slate-750">
                <p>Registereintrag: {SITE.register}</p>
                <p>Umsatzsteuer-ID: {SITE.vatId}</p>
                <p>Zuständige Aufsichtsbehörde: bitte falls erforderlich final ergänzen.</p>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-slate-50 p-6">
              <h2 className="text-2xl font-extrabold text-slate-950">Haftung und Streitbeilegung</h2>
              <p className="mt-4 text-sm leading-6 text-slate-750">
                Angaben zu Haftung für Inhalte, Links, Urheberrecht und Verbraucherstreitbeilegung müssen rechtlich
                geprüft und passend zum Unternehmen ergänzt werden.
              </p>
            </section>
          </div>
        </div>
      </section>
      <SEOJsonLd
        data={graph([
          webPageSchema({
            name: "Impressum",
            description: "Impressum von Hausvia mit Anbieterkennzeichnung und Kontaktdaten.",
            path: "/impressum",
          }),
          breadcrumbSchema([
            { name: "Startseite", href: "/" },
            { name: "Impressum", href: "/impressum" },
          ]),
        ])}
      />
    </main>
  );
}
