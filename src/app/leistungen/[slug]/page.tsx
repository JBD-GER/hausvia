import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CTASection } from "@/components/CTASection";
import { FAQAccordion } from "@/components/FAQAccordion";
import { Hero } from "@/components/Hero";
import { InternalLinks } from "@/components/InternalLinks";
import { ProcessSteps } from "@/components/ProcessSteps";
import { SectionHeading } from "@/components/SectionHeading";
import { SEOJsonLd } from "@/components/SEOJsonLd";
import { TrustBar } from "@/components/TrustBar";
import { trustItems } from "@/lib/site";
import { findServiceLandingPage, serviceLandingPages } from "@/lib/serviceLandingPages";
import { breadcrumbSchema, faqSchema, graph, metadataForPage, serviceSchema, webPageSchema } from "@/lib/seo";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return serviceLandingPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = findServiceLandingPage(slug);

  if (!page) return {};

  return metadataForPage({
    title: page.title,
    description: page.description,
    path: `/leistungen/${page.slug}`,
    image: page.image,
    imageAlt: page.imageAlt,
    keywords: [page.eyebrow, `${page.eyebrow} Hannover`, "Hausmeisterservice Hannover Leistungen"],
  });
}

function CardGrid({ title, text, items }: { title: string; text?: string; items: string[] }) {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <SectionHeading title={title} text={text} />
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

export default async function IndividualServicePage({ params }: PageProps) {
  const { slug } = await params;
  const page = findServiceLandingPage(slug);

  if (!page) {
    notFound();
  }

  return (
    <main>
      <Breadcrumbs
        items={[
          { label: "Startseite", href: "/" },
          { label: "Leistungen", href: "/hausmeisterservice-hannover" },
          { label: page.eyebrow, href: `/leistungen/${page.slug}` },
        ]}
      />
      <Hero
        eyebrow={page.eyebrow}
        title={page.h1}
        text={page.intro}
        image={page.image}
        imageAlt={page.imageAlt}
        primaryHref="/kosten-einschaetzen"
        primaryLabel="Kosteneinschätzung anfordern"
        secondaryHref="/kontakt"
        secondaryLabel="Klassisch anfragen"
        trustText="Einzelleistung oder im Rundum-Sorglos-Paket kombinierbar"
        bullets={[
          "Hannover und Umgebung",
          "Für WEGs, Verwaltungen und Gewerbe",
          "Unverbindliche Einschätzung per E-Mail",
          "Kombinierbar mit laufender Objektbetreuung",
        ]}
      />
      <TrustBar items={trustItems} />

      <CardGrid
        title={`Was umfasst ${page.eyebrow}?`}
        text="Der konkrete Umfang wird passend zum Objekt, zur Fläche und zum gewünschten Turnus abgestimmt."
        items={page.included}
      />

      <section className="bg-slate-50">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <SectionHeading title="Für welche Objekte ist diese Leistung sinnvoll?" />
            <p className="mt-5 text-base leading-7 text-slate-700">
              Hausvia richtet die Ausführung nicht an einem starren Standard aus, sondern am Alltag Ihres Objekts.
              Entscheidend sind Nutzung, Zugänglichkeit, Flächen und der gewünschte Betreuungsgrad.
            </p>
          </div>
          <div className="grid gap-3">
            {page.suitable.map((item) => (
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
            title="So läuft die Abstimmung ab"
            text="Die Anfrage bleibt bewusst einfach: grobe Angaben reichen, damit Hausvia den Bedarf realistisch einordnen kann."
          />
          <div className="mt-8">
            <ProcessSteps steps={page.process.map((item, index) => ({ title: `Schritt ${index + 1}`, text: item }))} />
          </div>
        </div>
      </section>

      <CardGrid title="Warum Hausvia?" items={page.why} />

      <section className="bg-slate-50">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
          <SectionHeading title={`FAQ zu ${page.eyebrow}`} />
          <div className="mt-8">
            <FAQAccordion items={page.faq} />
          </div>
        </div>
      </section>

      <InternalLinks links={page.relatedLinks} title="Passende Seiten und nächste Schritte" />
      <CTASection
        title={`${page.eyebrow} in Hannover anfragen`}
        text="Stellen Sie Objektart, Flächen und gewünschte Leistungen zusammen. Die unverbindliche Einschätzung wird per E-Mail vorbereitet."
        href="/kosten-einschaetzen"
        label="Kostencheck starten"
      />
      <SEOJsonLd
        data={graph([
          webPageSchema({
            name: page.h1,
            description: page.description,
            path: `/leistungen/${page.slug}`,
            image: page.image,
          }),
          breadcrumbSchema([
            { name: "Startseite", href: "/" },
            { name: "Leistungen", href: "/hausmeisterservice-hannover" },
            { name: page.eyebrow, href: `/leistungen/${page.slug}` },
          ]),
          faqSchema(page.faq),
          serviceSchema({
            name: page.h1,
            description: page.description,
            path: `/leistungen/${page.slug}`,
            serviceType: page.eyebrow,
          }),
        ])}
      />
    </main>
  );
}
