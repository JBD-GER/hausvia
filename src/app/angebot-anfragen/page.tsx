import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FAQAccordion } from "@/components/FAQAccordion";
import { Hero } from "@/components/Hero";
import { SectionHeading } from "@/components/SectionHeading";
import { SEOJsonLd } from "@/components/SEOJsonLd";
import { ServiceFunnel } from "@/components/ServiceFunnel";
import { TrustBar } from "@/components/TrustBar";
import { ASSETS, trustItems, type FaqItem } from "@/lib/site";
import { breadcrumbSchema, faqSchema, graph, metadataForPage, webPageSchema } from "@/lib/seo";

const faqs: FaqItem[] = [
  {
    question: "Ist die Anfrage kostenlos?",
    answer:
      "Ja. Die Online-Anfrage dient der ersten Einordnung. Die unverbindliche Kostenspanne wird nach dem Absenden per E-Mail bereitgestellt.",
  },
  {
    question: "Muss ich schon alle Leistungen genau kennen?",
    answer:
      "Nein. Sie können auch 'noch unklar' oder mehrere Leistungen auswählen. Details werden im Anschluss abgestimmt.",
  },
  {
    question: "Warum ist die Kostenspanne unverbindlich?",
    answer:
      "Hausmeisterservice hängt von Objektzustand, Zugänglichkeit, Flächen, Turnus und saisonalen Aufgaben ab. Die Spanne hilft bei der Budget-Einordnung und ersetzt kein verbindliches Angebot.",
  },
  {
    question: "Welche Daten werden benötigt?",
    answer:
      "Hausvia benötigt Standort, Objektart, gewünschte Leistungen und Kontaktdaten, um Ihre Anfrage sinnvoll einordnen zu können.",
  },
];

export const metadata: Metadata = metadataForPage({
  title: "Hausmeisterservice Hannover anfragen | Hausvia",
  description:
    "Hausmeisterservice-Kosten in Hannover online einschätzen. Objektart, Fläche und Leistungen angeben und unverbindliche Einschätzung erhalten.",
  path: "/angebot-anfragen",
  image: ASSETS.hero,
  imageAlt: "Hausvia Hausmeisterservice in Hannover anfragen",
  keywords: ["Hausmeisterservice Kosten Hannover", "Hausmeisterservice Angebot Hannover", "Objektbetreuung Kosten"],
});

export default function AngebotAnfragenPage() {
  return (
    <main>
      <Breadcrumbs
        items={[
          { label: "Startseite", href: "/" },
          { label: "Angebot anfragen", href: "/angebot-anfragen" },
        ]}
      />
      <Hero
        eyebrow="Service-Konfigurator"
        title="Hausmeisterservice-Kosten in 60 Sekunden einschätzen"
        text="Beantworten Sie wenige Fragen zu Objektart, Fläche und gewünschten Leistungen. Hausvia bereitet daraus eine realistische monatliche Kostenspanne für Ihre Objektbetreuung vor."
        image={ASSETS.hero}
        imageAlt="Hausvia Hausmeisterservice in Hannover anfragen"
        primaryHref="#anfrage"
        primaryLabel="Kosten jetzt einschätzen"
        secondaryHref="/kontakt"
        secondaryLabel="Direkt Kontakt aufnehmen"
        trustText="Realistische Einschätzung für WEG, Privathaushalt und Gewerbeobjekt"
      />
      <TrustBar items={trustItems} />

      <section className="bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <ServiceFunnel />
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-14 sm:px-6 lg:grid-cols-3 lg:px-8">
          {[
            "Für Hausverwaltungen, WEGs, Eigentümer und Gewerbekunden",
            "Einschätzung per E-Mail statt Sofortpreis im Browser",
            "Reparaturen und größere Sonderleistungen separat",
          ].map((item) => (
            <article key={item} className="rounded-lg border border-slate-200 bg-white p-5 text-sm font-bold text-slate-800 shadow-sm">
              {item}
            </article>
          ))}
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading title="FAQ zur Anfrage" />
          <div className="mt-8">
            <FAQAccordion items={faqs} />
          </div>
        </div>
      </section>

      <SEOJsonLd
        data={graph([
          webPageSchema({
            name: "Hausmeisterservice-Kosten in 60 Sekunden einschätzen",
            description:
              "Kostencheck für Hausmeisterservice, Objektbetreuung und Gebäudeservice in Hannover und Umgebung.",
            path: "/angebot-anfragen",
            image: ASSETS.hero,
          }),
          breadcrumbSchema([
            { name: "Startseite", href: "/" },
            { name: "Angebot anfragen", href: "/angebot-anfragen" },
          ]),
          faqSchema(faqs),
        ])}
      />
    </main>
  );
}
