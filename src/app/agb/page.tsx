import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { SEOJsonLd } from "@/components/SEOJsonLd";
import { SITE } from "@/lib/site";
import { breadcrumbSchema, graph, metadataForPage, webPageSchema } from "@/lib/seo";

export const metadata: Metadata = metadataForPage({
  title: "AGB | Hausvia",
  description:
    "Allgemeine Geschäftsbedingungen von Hausvia. Platzhalterseite, die vor Veröffentlichung rechtlich geprüft und ergänzt werden muss.",
  path: "/agb",
});

export default function AgbPage() {
  return (
    <main>
      <Breadcrumbs
        items={[
          { label: "Startseite", href: "/" },
          { label: "AGB", href: "/agb" },
        ]}
      />
      <section className="bg-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <p className="text-sm font-bold uppercase tracking-wide text-brand">Rechtlicher Platzhalter</p>
          <h1 className="mt-3 text-4xl font-extrabold text-slate-950">Allgemeine Geschäftsbedingungen</h1>
          <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
            Diese AGB-Seite ist ein neutraler Platzhalter und muss vor Veröffentlichung durch rechtlich geprüfte
            Allgemeine Geschäftsbedingungen ersetzt oder ergänzt werden.
          </p>

          <div className="mt-10 grid gap-5">
            {[
              {
                title: "1. Anbieter",
                text: `Anbieter der Leistungen ist ${SITE.legalName} unter der Marke Hausvia, ${SITE.address}. Kontakt: ${SITE.email}, Telefon: ${SITE.phone}. Diese Angaben sollten vor Veröffentlichung final geprüft werden.`,
              },
              {
                title: "2. Leistungsumfang",
                text: "Hausvia bietet Hausmeisterservice, Objektbetreuung, Gebäudeservices, Gartenpflege und angrenzende Dienstleistungen nach individueller Vereinbarung an. Der konkrete Leistungsumfang ergibt sich aus Angebot, Auftragsbestätigung oder individueller Abstimmung.",
              },
              {
                title: "3. Unverbindliche Ersteinschätzungen",
                text: "Online berechnete oder per PDF versendete Kostenspannen sind unverbindliche Ersteinschätzungen. Ein verbindliches Angebot entsteht erst nach Prüfung des Objekts, Abstimmung des Leistungsumfangs und ausdrücklicher Bestätigung.",
              },
              {
                title: "4. Sonderleistungen und Reparaturen",
                text: "Reparaturen, Instandsetzungen, größere Handwerksleistungen und Sonderaufgaben werden nicht automatisch Bestandteil einer laufenden Objektbetreuung. Sie sind separat zu beauftragen und zu kalkulieren.",
              },
              {
                title: "5. Preise, Zahlung und Laufzeiten",
                text: "Regelungen zu Preisen, Zahlungsbedingungen, Kündigungsfristen, Laufzeiten und Anpassungen müssen rechtlich geprüft und passend zum finalen Geschäftsmodell ergänzt werden.",
              },
              {
                title: "6. Haftung und Mitwirkung",
                text: "Regelungen zu Haftung, Mitwirkungspflichten, Zugang zum Objekt, Schlüsselübergabe, Dokumentation und Mängelmeldung müssen vor Veröffentlichung vollständig juristisch geprüft werden.",
              },
            ].map((section) => (
              <section key={section.title} className="rounded-lg border border-slate-200 bg-slate-50 p-6">
                <h2 className="text-xl font-extrabold text-slate-950">{section.title}</h2>
                <p className="mt-3 text-sm leading-7 text-slate-750">{section.text}</p>
              </section>
            ))}
          </div>
        </div>
      </section>
      <SEOJsonLd
        data={graph([
          webPageSchema({
            name: "Allgemeine Geschäftsbedingungen",
            description:
              "Allgemeine Geschäftsbedingungen von Hausvia als rechtlich zu prüfender Platzhalter.",
            path: "/agb",
          }),
          breadcrumbSchema([
            { name: "Startseite", href: "/" },
            { name: "AGB", href: "/agb" },
          ]),
        ])}
      />
    </main>
  );
}
