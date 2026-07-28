import { CheckCircle2 } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CTASection } from "@/components/CTASection";
import { FAQAccordion } from "@/components/FAQAccordion";
import { Hero } from "@/components/Hero";
import { InternalLinks } from "@/components/InternalLinks";
import { SectionHeading } from "@/components/SectionHeading";
import { ServiceOverview } from "@/components/ServiceOverview";
import { TrustBar } from "@/components/TrustBar";
import { overviewLocations, trustItems, type MarketingPage } from "@/lib/site";
import { LocationGrid } from "@/components/LocationGrid";

function BulletPanel({ title, intro, items }: { title: string; intro?: string; items: string[] }) {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <SectionHeading title={title} text={intro} />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <article key={item} className="rounded-lg border border-slate-200 bg-slate-50 p-5">
              <div className="flex gap-3">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-green-700" />
                <p className="text-sm font-semibold leading-6 text-slate-800">{item}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MarketingPageView({ page }: { page: MarketingPage }) {
  const includedSectionClass = page.pageType === "service" ? "bg-white" : "bg-slate-50";

  return (
    <main>
      <Breadcrumbs
        items={[
          { label: "Startseite", href: "/" },
          { label: page.eyebrow, href: `/${page.slug}` },
        ]}
      />
      <Hero
        eyebrow={page.eyebrow}
        title={page.h1}
        text={page.intro}
        image={page.image}
        imageAlt={page.imageAlt}
        primaryLabel={page.pageType === "target" ? "Betreuung anfragen" : "Kostenlose Anfrage starten"}
        secondaryHref="/einsatzgebiete"
        secondaryLabel="Einsatzgebiete ansehen"
        bullets={[
          "Feste Ansprechpartner",
          "Schnelle Rückmeldung",
          "Individuelle Betreuung",
          "Hannover und Umgebung",
        ]}
      />
      <TrustBar items={trustItems} />

      <BulletPanel title={page.suitable.title} intro={page.suitable.intro} items={page.suitable.items} />

      {page.pageType === "service" ? (
        <ServiceOverview
          background="slate"
          eyebrow="Leistungsbausteine"
          title="Diese Leistungen lassen sich mit Hausvia kombinieren"
          text="Viele Objekte brauchen nicht nur eine einzelne Aufgabe, sondern eine planbare Kombination aus Pflege, Reinigung, Kontrolle und Organisation. Die Übersicht zeigt die wichtigsten Bausteine, die Hausvia passend zum Objekt zusammenstellt."
        />
      ) : null}

      <section className={includedSectionClass}>
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <SectionHeading title={page.included.title} text={page.included.intro} />
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {page.included.items.map((item) => (
              <article key={item} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-base font-extrabold text-slate-950">{item.split(",")[0]}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-650">{item}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <BulletPanel title={page.process.title} intro={page.process.intro} items={page.process.items} />

      <section className="bg-slate-50">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <SectionHeading title={page.why.title} />
            <p className="mt-5 text-base leading-7 text-slate-700">{page.localText}</p>
          </div>
          <div className="grid gap-3">
            {page.why.items.map((item) => (
              <div key={item} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-5">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-green-700" />
                <p className="text-sm font-semibold leading-6 text-slate-800">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <SectionHeading
            title="Einsatzgebiete für Hausvia"
            text="Hausvia betreut Immobilien in Hannover und in passenden Orten der Umgebung. Auf den Ortsseiten finden Sie lokale Hinweise und typische Einsatzbereiche."
          />
          <div className="mt-8">
            <LocationGrid locations={overviewLocations.slice(0, 12)} />
          </div>
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
          <SectionHeading title={`FAQ zu ${page.eyebrow}`} />
          <div className="mt-8">
            <FAQAccordion items={page.faq} />
          </div>
        </div>
      </section>

      <InternalLinks links={page.internalLinks} title="Weiterführende Seiten" />
      <CTASection
        title={`${page.eyebrow} unverbindlich anfragen`}
        text="Starten Sie die Anfrage online und stellen Sie die passenden Leistungen für Ihr Objekt zusammen."
        href="/kosten-einschaetzen"
        label="Service zusammenstellen"
      />
    </main>
  );
}
