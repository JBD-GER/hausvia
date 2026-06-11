import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ContactForm } from "@/components/ContactForm";
import { CTASection } from "@/components/CTASection";
import { Hero } from "@/components/Hero";
import { SEOJsonLd } from "@/components/SEOJsonLd";
import { ASSETS, SITE } from "@/lib/site";
import { breadcrumbSchema, graph, metadataForPage } from "@/lib/seo";

export const metadata: Metadata = metadataForPage({
  title: "Kontakt | Hausvia Hausmeisterservice Hannover",
  description:
    "Kontakt zu Hausvia aufnehmen: Hausmeisterservice, Objektbetreuung und Gebäudeservice in Hannover und Umgebung unverbindlich anfragen.",
  path: "/kontakt",
  image: ASSETS.hero,
});

export default function KontaktPage() {
  return (
    <main>
      <Breadcrumbs
        items={[
          { label: "Startseite", href: "/" },
          { label: "Kontakt", href: "/kontakt" },
        ]}
      />
      <Hero
        eyebrow="Kontakt"
        title="Hausvia kontaktieren und Objektbetreuung anfragen"
        text="Sie möchten Hausmeisterservice, Gartenpflege oder Objektbetreuung klassisch anfragen? Senden Sie die wichtigsten Eckdaten zum Objekt direkt über das Kontaktformular."
        image={ASSETS.hero}
        imageAlt="Hausvia Kontakt für Hausmeisterservice in Hannover"
        primaryHref="#kontaktformular"
        primaryLabel="Klassische Anfrage senden"
        secondaryHref="/angebot-anfragen"
        secondaryLabel="Kostencheck nutzen"
      />

      <section className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <aside className="rounded-lg border border-slate-200 bg-slate-50 p-6">
            <h2 className="text-2xl font-extrabold text-slate-950">Kontaktdaten</h2>
            <p className="mt-3 text-sm leading-6 text-slate-650">
              Für Hausmeisterservice, Objektbetreuung und Gebäudeservice in Hannover erreichen Sie Hausvia über die
              folgenden Kontaktdaten.
            </p>
            <div className="mt-6 space-y-4 text-sm text-slate-800">
              <p className="flex gap-3">
                <MapPin aria-hidden="true" className="h-5 w-5 flex-none text-brand" />
                <span>
                  <strong>Adresse:</strong> {SITE.address}
                </span>
              </p>
              <p className="flex gap-3">
                <Phone aria-hidden="true" className="h-5 w-5 flex-none text-brand" />
                <span>
                  <strong>Telefon:</strong> {SITE.phone}
                </span>
              </p>
              <p className="flex gap-3">
                <Mail aria-hidden="true" className="h-5 w-5 flex-none text-brand" />
                <span>
                  <strong>E-Mail:</strong> {SITE.email}
                </span>
              </p>
            </div>
            <div className="mt-7 rounded-md bg-white p-4 text-sm leading-6 text-slate-700">
              <strong>Einsatzgebiet:</strong> Hannover und Umgebung, darunter List, Südstadt, Linden,
              Langenhagen, Garbsen, Laatzen, Isernhagen, Lehrte und Seelze.
            </div>
            <Link
              href="/angebot-anfragen"
              className="mt-6 inline-flex min-h-11 items-center rounded-md bg-brand px-5 py-2.5 text-sm font-bold text-white"
            >
              Jetzt Bedarf ermitteln
            </Link>
          </aside>

          <div id="kontaktformular" className="scroll-mt-28">
            <div className="mb-6 max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-wide text-brand">Klassische Anfrage</p>
              <h2 className="mt-2 text-3xl font-extrabold leading-tight text-slate-950">
                Anfrage ohne Kostenrechner senden
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-650">
                Beschreiben Sie kurz Objekt, Ort und gewünschte Leistungen. Hausvia prüft den Bedarf und kann auf dieser
                Grundlage eine passende Rückmeldung vorbereiten.
              </p>
            </div>
            <ContactForm />
          </div>
        </div>
      </section>

      <CTASection
        title="Noch strukturierter anfragen"
        text="Der Service-Konfigurator führt Sie Schritt für Schritt durch Objektart, Standort, Leistungen und Umfang."
        label="Zum Anfrage-Funnel"
      />
      <SEOJsonLd
        data={graph([
          breadcrumbSchema([
            { name: "Startseite", href: "/" },
            { name: "Kontakt", href: "/kontakt" },
          ]),
        ])}
      />
    </main>
  );
}
