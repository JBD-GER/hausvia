import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CTASection } from "@/components/CTASection";
import { FAQAccordion } from "@/components/FAQAccordion";
import { Hero } from "@/components/Hero";
import { InternalLinks } from "@/components/InternalLinks";
import { SectionHeading } from "@/components/SectionHeading";
import { hausmeisterserviceHubLink, regionalResourceLink } from "@/lib/internalLinking";
import type { LocationPage } from "@/lib/site";

export function LocationPageView({ page }: { page: LocationPage }) {
  return (
    <main>
      <Breadcrumbs
        items={[
          { label: "Startseite", href: "/" },
          { label: "Einsatzgebiete", href: "/einsatzgebiete" },
          { label: page.h1.replace("Hausmeisterservice in ", ""), href: `/einsatzgebiete/${page.slug}` },
        ]}
      />
      <Hero
        eyebrow="Lokaler Hausmeisterservice"
        title={page.h1}
        text={page.intro}
        image={page.image}
        imageAlt={page.imageAlt}
        primaryLabel="Hausmeisterservice am Standort anfragen"
        secondaryHref="/einsatzgebiete"
        secondaryLabel="Alle Hausvia Einsatzgebiete"
        bullets={[
          "Hausmeisterservice",
          "Objektbetreuung",
          "Gebäudeservice",
          "Individuell anfragen",
        ]}
      />

      <section className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
          <div>
            <SectionHeading title={page.localHeading} text={page.localText} />
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm">
            <Image
              src={page.image}
              alt={page.imageAlt}
              width={900}
              height={700}
              sizes="(min-width: 1024px) 48vw, 100vw"
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-950">{page.objectHeading}</h2>
            <div className="mt-6 grid gap-3">
              {page.objectItems.map((item) => (
                <div key={item} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-5">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-green-700" />
                  <p className="text-sm font-semibold leading-6 text-slate-800">{item}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-extrabold text-slate-950">{page.serviceHeading}</h2>
            <div className="mt-6 grid gap-3">
              {page.serviceItems.map((item) => (
                <div key={item} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-5">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-green-700" />
                  <p className="text-sm font-semibold leading-6 text-slate-800">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
          <SectionHeading title="Häufige Fragen zum Standort" />
          <div className="mt-8">
            <FAQAccordion items={page.faq} />
          </div>
        </div>
      </section>

      <InternalLinks
        links={[regionalResourceLink, hausmeisterserviceHubLink, ...page.internalLinks]}
        title="Passende Leistungen und Ratgeber"
        currentHref={`/einsatzgebiete/${page.slug}`}
      />
      <CTASection
        title="Hausmeisterservice für diesen Standort anfragen"
        text="Beschreiben Sie Objektart, Standort und gewünschte Leistungen. Hausvia prüft, welche Betreuung für Ihr Objekt passt."
        label="Hausmeisterservice am Standort anfragen"
      />
    </main>
  );
}
