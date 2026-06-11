import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CTASection } from "@/components/CTASection";
import { Hero } from "@/components/Hero";
import { ImageSection } from "@/components/ImageSection";
import { SectionHeading } from "@/components/SectionHeading";
import { SEOJsonLd } from "@/components/SEOJsonLd";
import { ASSETS } from "@/lib/site";
import { breadcrumbSchema, graph, metadataForPage } from "@/lib/seo";

export const metadata: Metadata = metadataForPage({
  title: "Über Hausvia | Hausmeisterservice in Hannover",
  description:
    "Mehr über Hausvia: lokaler Hausmeisterservice, Objektbetreuung und Gebäudeservice für Hannover und Umgebung mit klarer Kommunikation.",
  path: "/ueber-uns",
  image: ASSETS.garden,
});

export default function UeberUnsPage() {
  return (
    <main>
      <Breadcrumbs
        items={[
          { label: "Startseite", href: "/" },
          { label: "Über uns", href: "/ueber-uns" },
        ]}
      />
      <Hero
        eyebrow="Über Hausvia"
        title="Hausvia steht für zuverlässige Objektbetreuung in Hannover"
        text="Hausvia arbeitet lokal, verbindlich und serviceorientiert. Im Fokus stehen gepflegte Immobilien, klare Rückmeldungen und Leistungen, die zu Hausverwaltungen, WEGs, Eigentümern und Gewerbeobjekten passen."
        image={ASSETS.garden}
        imageAlt="Hausvia Team bei der Gartenpflege in Hannover"
        primaryLabel="Betreuung anfragen"
        secondaryHref="/hausmeisterservice-hannover"
        secondaryLabel="Leistungen ansehen"
      />

      <ImageSection
        title="Arbeitsweise: aufmerksam, praktisch, nachvollziehbar"
        text="Hausvia versteht Hausmeisterservice nicht als lose Sammlung einzelner Aufgaben. Entscheidend ist, dass ein Objekt regelmäßig im Blick bleibt und Verwaltungen oder Eigentümer schnell erfahren, wenn etwas auffällt."
        image={ASSETS.repair}
        imageAlt="Hausvia Mitarbeiter bei einer Objektkontrolle in Hannover"
        points={[
          "Regelmäßige Objektkontrollen und sichtbare Pflege",
          "Schnelle Rückmeldung bei Schäden und Störungen",
          "Feste Ansprechpartner für laufende Abstimmungen",
          "Individuelle Betreuung für Wohnanlagen und Gewerbe",
        ]}
      />

      <section className="bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading
            title="Werte, die im Alltag zählen"
            text="Hausvia setzt auf die Dinge, die für Objektbetreuung wirklich relevant sind: Verlässlichkeit, Ordnung, Erreichbarkeit und ein genauer Blick für wiederkehrende Themen am Gebäude."
          />
          <div className="mt-9 grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Verbindlichkeit",
                text: "Absprachen zu Turnus, Umfang und Ansprechpartnern werden klar festgelegt.",
              },
              {
                title: "Lokalität",
                text: "Der Fokus liegt auf Hannover und Umgebung, damit Betreuung praktisch planbar bleibt.",
              },
              {
                title: "Transparenz",
                text: "Auffälligkeiten und Schäden werden nicht übersehen, sondern nachvollziehbar gemeldet.",
              },
            ].map((item) => (
              <article key={item.title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-extrabold text-slate-950">{item.title}</h2>
                <p className="mt-3 text-sm leading-7 text-slate-650">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <CTASection
        title="Hausvia für Ihr Objekt kennenlernen"
        text="Starten Sie die Anfrage und beschreiben Sie, welche Betreuung Ihre Immobilie in Hannover oder Umgebung braucht."
        label="Kostenlose Anfrage starten"
      />
      <SEOJsonLd
        data={graph([
          breadcrumbSchema([
            { name: "Startseite", href: "/" },
            { name: "Über uns", href: "/ueber-uns" },
          ]),
        ])}
      />
    </main>
  );
}
