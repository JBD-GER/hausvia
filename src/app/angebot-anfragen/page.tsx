import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, PhoneCall } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FAQAccordion } from "@/components/FAQAccordion";
import { Hero } from "@/components/Hero";
import { InternalLinks } from "@/components/InternalLinks";
import { OfferRequestForm, type WinterOfferRequestContext } from "@/components/OfferRequestForm";
import { SectionHeading } from "@/components/SectionHeading";
import { SEOJsonLd } from "@/components/SEOJsonLd";
import { TrustBar } from "@/components/TrustBar";
import { ASSETS, trustItems, type FaqItem } from "@/lib/site";
import { staticPageInternalLinks } from "@/lib/internalLinking";
import { breadcrumbSchema, faqSchema, graph, metadataForPage, webPageSchema } from "@/lib/seo";
import {
  calculateWinterPrice,
  deriveWinterSurfaceProfile,
  parseWinterPricingInput,
  winterPricingLabels,
} from "@/lib/winterPricing";

type PageSearchParams = Record<string, string | string[] | undefined>;

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

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

export default async function AngebotAnfragenPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const isWinterRequest = firstSearchParam(params.leistung).toLowerCase() === "winterdienst";
  const winterDraftId = firstSearchParam(params.entwurf).slice(0, 100);
  const parsedWinterInput = isWinterRequest ? parseWinterPricingInput(params) : null;
  const winterInput = parsedWinterInput
    ? {
        ...parsedWinterInput,
        surfaceProfile: deriveWinterSurfaceProfile(parsedWinterInput.area, parsedWinterInput.access),
      }
    : null;
  const winterRequestContext: WinterOfferRequestContext | undefined = isWinterRequest
    ? {
        service: "winterdienst",
        ...(winterInput
          ? {
              input: winterInput,
              estimate: calculateWinterPrice(winterInput),
              labels: winterPricingLabels(winterInput),
            }
          : {}),
      }
    : undefined;

  return (
    <main>
      <Breadcrumbs
        items={[
          { label: "Startseite", href: "/" },
          { label: "Hausmeisterservice-Angebot", href: "/angebot-anfragen" },
        ]}
      />
      <Hero
        eyebrow={isWinterRequest ? "Winterdienst anfragen" : "Angebot anfragen"}
        title={isWinterRequest ? "Winterdienst anfragen" : "Hausmeister-Service Hannover"}
        text={
          winterInput
            ? "Ihre Winterdienstangaben sind bereits übernommen. Ergänzen Sie nur Ihre Kontaktdaten – Hausvia prüft anschließend Objekt, Flächen und Tourenkapazität."
            : isWinterRequest
              ? "Vier Kontaktdaten genügen. Hausvia prüft anschließend Ihr Objekt, die gewünschten Winterdienstflächen und die verfügbare Tourenkapazität."
            : "Vorname, Nachname, Telefonnummer und E-Mail genügen. Hausvia meldet sich persönlich bei Ihnen und klärt alle weiteren Details bequem im direkten Austausch."
        }
        trustText={isWinterRequest ? undefined : "Kostenlos, unverbindlich und ohne langes Formular"}
        bullets={
          isWinterRequest
            ? [
                winterInput ? "Rechnerwerte sicher übernommen" : "Winterdienst bereits vorausgewählt",
                "Kostenlos und unverbindlich anfragen",
              ]
            : []
        }
        aside={<OfferRequestForm requestContext={winterRequestContext} winterDraftId={winterDraftId} />}
        showActions={false}
      />
      <TrustBar items={trustItems} />

      <section className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Einfach anfragen"
            title="Wir übernehmen den Rest"
            text="Sie müssen noch keine Objektflächen, Leistungen oder Termine kennen. Nach Ihrer Anfrage klären wir gemeinsam, welche Betreuung wirklich zu Ihrem Objekt passt."
          />
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
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
              Hausmeisterservice-Kosten einschätzen
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

      <InternalLinks
        links={staticPageInternalLinks.offerRequest}
        title="Passende Leistungen vor der Anfrage"
        currentHref="/angebot-anfragen"
      />
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
