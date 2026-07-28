import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, PhoneCall } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FAQAccordion } from "@/components/FAQAccordion";
import { Hero } from "@/components/Hero";
import { OfferRequestForm } from "@/components/OfferRequestForm";
import { SectionHeading } from "@/components/SectionHeading";
import { SEOJsonLd } from "@/components/SEOJsonLd";
import { TrustBar } from "@/components/TrustBar";
import { ASSETS, trustItems, type FaqItem } from "@/lib/site";
import { breadcrumbSchema, faqSchema, graph, metadataForPage, webPageSchema } from "@/lib/seo";

const faqs: FaqItem[] = [
  {
    question: "Ist die Angebotsanfrage kostenlos und unverbindlich?",
    answer:
      "Ja. Die Anfrage ist kostenlos und verpflichtet Sie zu nichts. Ein verbindlicher Auftrag entsteht erst, wenn Sie ein individuell abgestimmtes Angebot ausdrücklich annehmen.",
  },
  {
    question: "Welche Angaben werden benötigt?",
    answer:
      "Für die erste Kontaktaufnahme genügen Vorname, Nachname, Telefonnummer und E-Mail-Adresse. Alle Angaben zum Objekt und zu den gewünschten Leistungen klärt Hausvia anschließend persönlich mit Ihnen.",
  },
  {
    question: "Wann meldet sich Hausvia?",
    answer:
      "Hausvia prüft Ihre Anfrage und meldet sich zeitnah telefonisch oder per E-Mail, um den Bedarf und die nächsten Schritte abzustimmen.",
  },
  {
    question: "Kann ich die Kosten vorab einschätzen lassen?",
    answer:
      "Ja. Auf der separaten Seite zur Kosteneinschätzung können Sie Objektart, Fläche, Leistungen, Häufigkeit und Komplexität Schritt für Schritt angeben.",
  },
];

export const metadata: Metadata = metadataForPage({
  title: "Angebot anfragen | Hausvia Hausmeisterservice Hannover",
  description:
    "Hausvia Angebot kostenlos und unverbindlich anfragen. Vorname, Nachname, Telefonnummer und E-Mail genügen für die persönliche Rückmeldung.",
  path: "/angebot-anfragen",
  image: ASSETS.hero,
  imageAlt: "Hausvia Angebot für Hausmeisterservice in Hannover anfragen",
  keywords: ["Hausmeisterservice Angebot Hannover", "Objektbetreuung Angebot", "Hausvia Angebot anfragen"],
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
        eyebrow="Angebot anfragen"
        title="Mit vier Angaben zum persönlichen Angebot"
        text="Vorname, Nachname, Telefonnummer und E-Mail genügen. Hausvia meldet sich persönlich bei Ihnen und klärt alle weiteren Details bequem im direkten Austausch."
        image={ASSETS.hero}
        imageAlt="Hausvia Angebot für Hausmeisterservice in Hannover anfragen"
        primaryHref="#anfrage"
        primaryLabel="Anfrage jetzt senden"
        secondaryHref="/kosten-einschaetzen"
        secondaryLabel="Kosten vorab einschätzen"
        trustText="Kostenlos, unverbindlich und ohne langes Formular"
      />
      <TrustBar items={trustItems} />

      <section id="anfrage" className="scroll-mt-24 bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:px-8">
          <div className="lg:sticky lg:top-28">
            <SectionHeading
              eyebrow="Einfach anfragen"
              title="Wir übernehmen den Rest"
              text="Sie müssen noch keine Objektflächen, Leistungen oder Termine kennen. Nach Ihrer Anfrage klären wir gemeinsam, welche Betreuung wirklich zu Ihrem Objekt passt."
            />
            <div className="mt-7 grid gap-3">
              {[
                {
                  title: "Nur vier Kontaktdaten",
                  text: "Keine Objektunterlagen und keine lange Vorbereitung erforderlich.",
                  icon: CheckCircle2,
                },
                {
                  title: "Persönliche Rückmeldung",
                  text: "Hausvia stimmt Bedarf und offene Fragen direkt mit Ihnen ab.",
                  icon: PhoneCall,
                },
                {
                  title: "Schnell ausgefüllt",
                  text: "Die Anfrage dauert in der Regel weniger als eine Minute.",
                  icon: Clock3,
                },
              ].map((item) => {
                const Icon = item.icon;

                return (
                  <article key={item.title} className="flex gap-4 rounded-lg border border-slate-200 bg-white p-4">
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-md bg-brand-soft text-brand">
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-base font-extrabold text-slate-950">{item.title}</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-650">{item.text}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <OfferRequestForm />
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-brand/15 bg-brand-soft p-6 sm:flex sm:items-center sm:justify-between sm:gap-8 sm:p-8">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-brand">Lieber genauer kalkulieren?</p>
              <h2 className="mt-2 text-2xl font-extrabold text-slate-950">Separate Kosteneinschätzung nutzen</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-650">
                Der ausführliche Kostencheck führt Sie durch Objektart, Fläche, Leistungen und Häufigkeit und erstellt
                anschließend eine unverbindliche Einschätzung.
              </p>
            </div>
            <Link
              href="/kosten-einschaetzen"
              className="mt-5 inline-flex min-h-12 flex-none items-center justify-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-dark sm:mt-0"
            >
              Zur Kosteneinschätzung
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading title="FAQ zur Angebotsanfrage" />
          <div className="mt-8">
            <FAQAccordion items={faqs} />
          </div>
        </div>
      </section>

      <SEOJsonLd
        data={graph([
          webPageSchema({
            name: "Angebot für Hausmeisterservice anfragen",
            description:
              "Kurze, kostenlose und unverbindliche Angebotsanfrage für Hausmeisterservice und Objektbetreuung.",
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
