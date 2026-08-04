import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FAQAccordion } from "@/components/FAQAccordion";
import { Hero } from "@/components/Hero";
import { SectionHeading } from "@/components/SectionHeading";
import { SEOJsonLd } from "@/components/SEOJsonLd";
import { ServiceFunnel } from "@/components/ServiceFunnel";
import { ASSETS, type FaqItem } from "@/lib/site";
import { breadcrumbSchema, faqSchema, graph, metadataForPage, webPageSchema } from "@/lib/seo";

const faqs: FaqItem[] = [
  {
    question: "Ist die Kosteneinschätzung kostenlos?",
    answer:
      "Ja. Der Online-Kostencheck dient der ersten Einordnung. Die unverbindliche Kostenspanne wird nach dem Absenden per E-Mail bereitgestellt.",
  },
  {
    question: "Muss ich schon alle Leistungen genau kennen?",
    answer:
      "Nein. Sie können mehrere Leistungen auswählen und den Bedarf im Anschluss gemeinsam mit Hausvia konkretisieren.",
  },
  {
    question: "Warum ist die Kostenspanne unverbindlich?",
    answer:
      "Die Kosten hängen von Objektzustand, Zugänglichkeit, Flächen, Turnus und saisonalen Aufgaben ab. Die Spanne hilft bei der Budget-Einordnung und ersetzt kein verbindliches Angebot.",
  },
  {
    question: "Welche Daten werden benötigt?",
    answer:
      "Für eine sinnvolle Einordnung werden Standort, Objektart, Flächen, gewünschte Leistungen und Kontaktdaten benötigt.",
  },
];

export const metadata: Metadata = metadataForPage({
  title: "Hausmeisterservice-Kosten einschätzen | Hausvia Hannover",
  description:
    "Hausmeisterservice-Kosten in Hannover online einschätzen. Objektart, Fläche und Leistungen angeben und unverbindliche Einschätzung erhalten.",
  path: "/kosten-einschaetzen",
  image: ASSETS.hero,
  imageAlt: "Hausvia Kosten für Hausmeisterservice in Hannover einschätzen",
  keywords: ["Hausmeisterservice Kosten Hannover", "Hausmeisterservice Kostencheck", "Objektbetreuung Kosten"],
});

export default function KostenEinschaetzenPage() {
  return (
    <main>
      <Breadcrumbs
        items={[
          { label: "Startseite", href: "/" },
          { label: "Kosten einschätzen", href: "/kosten-einschaetzen" },
        ]}
      />
      <Hero
        eyebrow="Kostencheck"
        title="Hausmeisterservice-Kosten in 60 Sekunden einschätzen"
        text="Beantworten Sie wenige Fragen zu Objektart, Fläche und gewünschten Leistungen. Hausvia bereitet daraus eine realistische Kostenspanne für Ihre Objektbetreuung oder einen einmaligen Einsatz vor."
        image={ASSETS.hero}
        imageAlt="Hausvia Kosten für Hausmeisterservice in Hannover einschätzen"
        primaryHref="#anfrage"
        primaryLabel="Kosten jetzt einschätzen"
        secondaryHref="/angebot-anfragen"
        secondaryLabel="Einfach Angebot anfragen"
        trustText="Realistische Einschätzung für WEG, Privathaushalt und Gewerbeobjekt"
        aside={<ServiceFunnel compact />}
        showActions={false}
      />

      <section className="bg-slate-50">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-14 sm:px-6 lg:grid-cols-3 lg:px-8">
          {[
            "Für Hausverwaltungen, WEGs, Eigentümer und Gewerbekunden",
            "Einschätzung per E-Mail statt Sofortpreis im Browser",
            "Reparaturen und größere Sonderleistungen separat",
          ].map((item) => (
            <article
              key={item}
              className="rounded-lg border border-slate-200 bg-white p-5 text-sm font-bold text-slate-800 shadow-sm"
            >
              {item}
            </article>
          ))}
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading title="FAQ zur Kosteneinschätzung" />
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
            path: "/kosten-einschaetzen",
            image: ASSETS.hero,
          }),
          breadcrumbSchema([
            { name: "Startseite", href: "/" },
            { name: "Kosten einschätzen", href: "/kosten-einschaetzen" },
          ]),
          faqSchema(faqs),
        ])}
      />
    </main>
  );
}
