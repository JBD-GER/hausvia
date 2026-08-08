import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AllInOneSection } from "@/components/AllInOneSection";
import { CTASection } from "@/components/CTASection";
import { FAQAccordion } from "@/components/FAQAccordion";
import { Hero } from "@/components/Hero";
import { ImageSection } from "@/components/ImageSection";
import { LocationGrid } from "@/components/LocationGrid";
import { ProcessSteps } from "@/components/ProcessSteps";
import { ReviewSection } from "@/components/ReviewSection";
import { SectionHeading } from "@/components/SectionHeading";
import { SEOJsonLd } from "@/components/SEOJsonLd";
import { ServiceCard } from "@/components/ServiceCard";
import { TrustBar } from "@/components/TrustBar";
import {
  ASSETS,
  featuredLocations,
  homeFaqs,
  processSteps,
  targetCards,
  trustItems,
} from "@/lib/site";
import { faqSchema, graph, itemListSchema, metadataForPage, serviceSchema, webPageSchema } from "@/lib/seo";

export const metadata: Metadata = metadataForPage({
  title: "Hausmeisterservice Hannover | Hausvia",
  description:
    "Hausvia bietet Hausmeisterservice, Objektbetreuung und Gebäudeservice in Hannover und Umgebung. Jetzt Bedarf online zusammenstellen und kostenlos anfragen.",
  path: "/",
  imageAlt: "Hausvia Hausmeisterservice und Objektbetreuung in Hannover",
  keywords: ["Hausmeisterservice Hannover", "Hausmeister Hannover", "Objektbetreuung Hannover"],
});

export default function Home() {
  return (
    <main>
      <Hero
        eyebrow="Hausvia Hausmeisterservice"
        title="Hausmeisterservice in Hannover – zuverlässig, digital und vor Ort"
        text="Hausvia unterstützt Hausverwaltungen, Eigentümer und Gewerbekunden bei der laufenden Pflege, Kontrolle und Betreuung von Immobilien in Hannover und Umgebung."
        image={ASSETS.hero}
        imageAlt="Hausvia Team für Hausmeisterservice in Hannover bei der Treppenhausreinigung"
        primaryHref="/kosten-einschaetzen"
        primaryLabel="Kosten jetzt einschätzen"
        secondaryHref="/hausmeisterservice-hannover"
        secondaryLabel="Hausmeisterservice-Leistungen"
        trustText="Zuverlässige Objektbetreuung für WEGs, Privathaushalte und Gewerbe"
        bullets={[
          "Unverbindliche Ersteinschätzung",
          "Flexible Leistungspakete",
          "Regelmäßige Betreuung statt Einzelchaos",
          "Transparente Einschätzung nach Fläche und Aufwand",
        ]}
      />
      <TrustBar items={trustItems} />

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div>
            <SectionHeading
              eyebrow="Kostencheck"
              title="Was kostet ein Hausmeisterservice für Ihr Objekt?"
              text="Beantworten Sie wenige Fragen zu Objektart, Fläche, Außenanlagen, Häufigkeit und gewünschten Leistungen. So entsteht eine realistische unverbindliche Ersteinschätzung für Ihren konkreten Bedarf."
            />
            <div className="mt-8 grid gap-3 text-sm font-semibold text-slate-750 md:grid-cols-3">
              <div className="min-h-24 rounded-lg border border-slate-200 bg-slate-50 p-5">
                Für WEGs, Privathaushalte und Gewerbeobjekte.
              </div>
              <div className="min-h-24 rounded-lg border border-slate-200 bg-slate-50 p-5">
                Unverbindliche Ersteinschätzung statt Dumping-Angebot.
              </div>
              <div className="min-h-24 rounded-lg border border-slate-200 bg-slate-50 p-5">
                Transparente Einschätzung nach Fläche, Aufwand und Leistungsumfang.
              </div>
            </div>
          </div>
          <div className="mt-8">
            <div className="rounded-xl border border-brand/15 bg-brand-soft p-6 sm:flex sm:items-center sm:justify-between sm:gap-8 sm:p-8">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-brand">Separater Kostencheck</p>
                <h3 className="mt-2 text-2xl font-extrabold text-slate-950">
                  Kosteneinschätzung Schritt für Schritt starten
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-650">
                  Der ausführliche Konfigurator öffnet sich auf einer eigenen Seite. Ihre Angaben bleiben übersichtlich
                  und Sie können sich ganz auf die einzelnen Schritte konzentrieren.
                </p>
              </div>
              <Link
                href="/kosten-einschaetzen"
                className="mt-5 inline-flex min-h-12 flex-none items-center justify-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-dark sm:mt-0"
              >
                Hausmeisterservice-Kosten einschätzen
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <AllInOneSection />

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Zielgruppen"
            title="Für wen Hausvia arbeitet"
            text="Die Website ist auf die typischen Anforderungen von Verwaltungen, Eigentümern und gewerblichen Nutzern ausgelegt."
          />
          <div className="mt-9 grid gap-4 md:grid-cols-3">
            {targetCards.map((item) => (
              <ServiceCard key={item.href} item={item} />
            ))}
          </div>
        </div>
      </section>

      <ImageSection
        title="Das können Kunden von Hausvia erwarten"
        text="Hausvia setzt auf klare Kommunikation, feste Ansprechpartner und eine sichtbare, regelmäßige Objektpflege. Statt pauschaler Versprechen zählt, dass Aufgaben sauber abgestimmt und verlässlich umgesetzt werden."
        image={ASSETS.repair}
        imageAlt="Hausvia Mitarbeiter prüft eine Klingelanlage bei der Objektbetreuung in Hannover"
        points={[
          "Schnelle Rückmeldung bei Schäden und Auffälligkeiten",
          "Regelmäßige Kontrollgänge statt reiner Einzelaufträge",
          "Individuelle Leistungspakete für Wohnanlagen und Gewerbe",
          "Geeignet für Hausverwaltungen, WEGs und private Eigentümer",
        ]}
      />

      <ReviewSection />

      <section className="bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Ablauf"
            title="So wird aus einer Anfrage eine passende Betreuung"
            text="Der Prozess bleibt bewusst einfach: Bedarf klären, Rückmeldung erhalten, Objektbetreuung starten."
          />
          <div className="mt-9">
            <ProcessSteps steps={processSteps} />
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Lokal"
            title="Einsatzgebiete in Hannover und Umgebung"
            text="Hausvia ist lokal auf Hannover und passende Orte im Umland ausgerichtet. Die Ortsseiten zeigen typische Objektarten und Leistungen für den jeweiligen Standort."
          />
          <div className="mt-9">
            <LocationGrid locations={featuredLocations} />
            <Link
              href="/einsatzgebiete"
              className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-brand underline decoration-brand/25 underline-offset-4 hover:text-brand-dark"
            >
              Alle Einsatzgebiete in Hannover und Umgebung
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <ImageSection
        reverse
        title="Über Hausvia"
        text="Hausvia steht für praktische, verbindliche Objektbetreuung. Im Mittelpunkt stehen gepflegte Immobilien, erreichbare Ansprechpartner und eine Arbeitsweise, die für Verwaltungen und Eigentümer nachvollziehbar bleibt."
        image={ASSETS.garden}
        imageAlt="Hausvia Team bei Gartenpflege und Grünanlagenpflege in Hannover"
        points={[
          "Regionaler Fokus auf Hannover und Umgebung",
          "Saubere Ausführung in Innen- und Außenbereichen",
          "Klare Abstimmung von Turnus, Umfang und Ansprechpartnern",
          "Keine erfundenen Bewertungen, sondern konkrete Erwartungen",
        ]}
      />

      <section className="bg-slate-50">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="FAQ" title="Häufige Fragen zu Hausvia" />
          <div className="mt-9">
            <FAQAccordion items={homeFaqs} />
          </div>
        </div>
      </section>

      <CTASection
        title="Hausmeisterservice in Hannover jetzt anfragen"
        text="Vier Kontaktdaten genügen. Hausvia meldet sich persönlich bei Ihnen und klärt den Bedarf gemeinsam mit Ihnen."
        label="Hausmeisterservice kostenlos anfragen"
      />
      <SEOJsonLd
        data={graph([
          webPageSchema({
            name: "Hausmeisterservice Hannover | Hausvia",
            description:
              "Hausvia bietet Hausmeisterservice, Objektbetreuung und Gebäudeservice in Hannover und Umgebung.",
            path: "/",
            image: ASSETS.hero,
          }),
          serviceSchema({
            name: "Hausmeisterservice Hannover",
            description:
              "Zuverlässiger Hausmeisterservice, Objektbetreuung und laufende Immobilienpflege in Hannover und Umgebung.",
            path: "/",
            serviceType: "Hausmeisterservice",
          }),
          itemListSchema({
            name: "Hausvia Leistungsbereiche",
            path: "/",
            items: [
              { name: "Hausmeisterservice Hannover", href: "/hausmeisterservice-hannover" },
              { name: "Objektbetreuung Hannover", href: "/objektbetreuung-hannover" },
              { name: "Gebäudeservice Hannover", href: "/gebaeudeservice-hannover" },
              { name: "Treppenhausreinigung Hannover", href: "/treppenhausreinigung-hannover" },
              { name: "Gartenpflege Hannover", href: "/gartenpflege-hannover" },
              { name: "Winterdienst Hannover", href: "/winterdienst-hannover" },
            ],
          }),
          faqSchema(homeFaqs),
        ])}
      />
    </main>
  );
}
