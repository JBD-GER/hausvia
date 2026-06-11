import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CTASection } from "@/components/CTASection";
import { FAQAccordion } from "@/components/FAQAccordion";
import { Hero } from "@/components/Hero";
import { LocationGrid } from "@/components/LocationGrid";
import { SectionHeading } from "@/components/SectionHeading";
import { SEOJsonLd } from "@/components/SEOJsonLd";
import { ASSETS, overviewLocations, type FaqItem } from "@/lib/site";
import { breadcrumbSchema, faqSchema, graph, metadataForPage } from "@/lib/seo";

const faqs: FaqItem[] = [
  {
    question: "In welchen Orten ist Hausvia tätig?",
    answer:
      "Hausvia ist auf Hannover und passende Orte in der Umgebung ausgerichtet. Ob ein Standort betreut werden kann, hängt von Objektlage, Umfang und gewünschtem Turnus ab.",
  },
  {
    question: "Gibt es Hausmeisterservice für einzelne Stadtteile?",
    answer:
      "Ja. Stadtteile wie List, Südstadt oder Linden können direkt angefragt werden. Für weitere Stadtteile wird der Bedarf individuell geprüft.",
  },
  {
    question: "Kann eine Hausverwaltung mehrere Orte gleichzeitig anfragen?",
    answer:
      "Ja. Mehrere Objekte können in einer Anfrage genannt werden, damit Hausvia den Leistungsumfang pro Standort einschätzen kann.",
  },
];

export const metadata: Metadata = metadataForPage({
  title: "Einsatzgebiete Hausmeisterservice Hannover | Hausvia",
  description:
    "Hausvia betreut Immobilien in Hannover, Stadtteilen und Umgebung. Übersicht der Einsatzgebiete für Hausmeisterservice, Objektbetreuung und Gebäudeservice.",
  path: "/einsatzgebiete",
  image: ASSETS.hero,
});

export default function EinsatzgebietePage() {
  return (
    <main>
      <Breadcrumbs
        items={[
          { label: "Startseite", href: "/" },
          { label: "Einsatzgebiete", href: "/einsatzgebiete" },
        ]}
      />
      <Hero
        eyebrow="Einsatzgebiete"
        title="Hausmeisterservice in Hannover und Umgebung"
        text="Hausvia betreut passende Immobilien in Hannover, wichtigen Stadtteilen und Orten der Region. Entscheidend sind Objektart, Leistungsumfang und ein sinnvoller Turnus."
        image={ASSETS.hero}
        imageAlt="Hausvia Hausmeisterservice in Hannover und Umgebung"
        primaryLabel="Standort anfragen"
        secondaryHref="/hausmeisterservice-hannover"
        secondaryLabel="Leistungen ansehen"
      />

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading
            title="Orte und Stadtteile für Hausvia"
            text="Die folgenden Standorte bilden den lokalen Fokus. Ausgebaute Ortsseiten enthalten zusätzliche Hinweise zu typischen Objektarten und Leistungen."
          />
          <div className="mt-9">
            <LocationGrid locations={overviewLocations} />
          </div>
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-16 sm:px-6 lg:grid-cols-3 lg:px-8">
          {[
            {
              title: "Hannover Stadtgebiet",
              text: "Für Wohnanlagen, WEGs, Mehrfamilienhäuser, Praxen, Büros und Gewerbeflächen in zentralen und wohnnahen Lagen.",
            },
            {
              title: "Stadtteile",
              text: "List, Südstadt, Linden und weitere Stadtteile werden anhand von Objektlage, Turnus und Leistungsumfang bewertet.",
            },
            {
              title: "Umland",
              text: "Langenhagen, Garbsen, Laatzen, Isernhagen, Lehrte, Seelze und weitere Orte können passend zur Route angefragt werden.",
            },
          ].map((item) => (
            <article key={item.title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-extrabold text-slate-950">{item.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-650">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading title="FAQ zu den Einsatzgebieten" />
          <div className="mt-8">
            <FAQAccordion items={faqs} />
          </div>
        </div>
      </section>

      <CTASection
        title="Einsatzgebiet für Ihr Objekt prüfen"
        text="Nennen Sie Standort, Objektart und gewünschte Leistungen. Hausvia prüft, ob eine passende Betreuung möglich ist."
        label="Jetzt Standort anfragen"
      />
      <SEOJsonLd
        data={graph([
          breadcrumbSchema([
            { name: "Startseite", href: "/" },
            { name: "Einsatzgebiete", href: "/einsatzgebiete" },
          ]),
          faqSchema(faqs),
        ])}
      />
    </main>
  );
}
