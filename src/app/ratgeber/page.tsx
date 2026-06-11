import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BlogCard } from "@/components/BlogCard";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CTASection } from "@/components/CTASection";
import { Hero } from "@/components/Hero";
import { SectionHeading } from "@/components/SectionHeading";
import { SEOJsonLd } from "@/components/SEOJsonLd";
import { ASSETS, blogCategories, blogPosts } from "@/lib/site";
import { breadcrumbSchema, graph, metadataForPage } from "@/lib/seo";

export const metadata: Metadata = metadataForPage({
  title: "Ratgeber Hausmeisterservice Hannover | Hausvia Wissen",
  description:
    "Hausvia Ratgeber für Hausmeisterservice, Objektbetreuung, WEGs und Immobilienpflege in Hannover. Praxisnahe SEO-Beiträge für Eigentümer und Hausverwaltungen.",
  path: "/ratgeber",
  image: ASSETS.blogManagement,
});

export default function RatgeberPage() {
  return (
    <main>
      <Breadcrumbs
        items={[
          { label: "Startseite", href: "/" },
          { label: "Ratgeber", href: "/ratgeber" },
        ]}
      />
      <Hero
        eyebrow="Hausvia Ratgeber"
        title="Ratgeber für Hausmeisterservice und Objektbetreuung in Hannover"
        text="Praxiswissen für Hausverwaltungen, WEGs, Eigentümer und Gewerbekunden: verständlich, lokal und auf echte Entscheidungen rund um Immobilienpflege ausgerichtet."
        image={ASSETS.blogManagement}
        imageAlt="Hausvia Ratgeber zur Objektbetreuung in Hannover"
        primaryLabel="Beiträge ansehen"
        primaryHref="#beitraege"
        secondaryHref="/angebot-anfragen"
        secondaryLabel="Bedarf ermitteln"
      />

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Kategorien"
            title="Ratgeber logisch sortiert"
            text="Die Beiträge sind nach Suchintent und Zielgruppe aufgebaut: Kosten, saisonale Services, Reinigung, Außenanlagen, WEG-Betreuung und laufende Objektpflege."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {blogCategories.map((category) => (
              <Link
                key={category.slug}
                href={`/ratgeber/kategorie/${category.slug}`}
                className="group rounded-lg border border-slate-200 bg-slate-50 p-6 transition hover:border-brand/40 hover:bg-white hover:shadow-sm"
              >
                <h2 className="text-2xl font-extrabold text-slate-950">{category.label}</h2>
                <p className="mt-3 text-sm leading-7 text-slate-650">{category.description}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-brand">
                  Kategorie ansehen
                  <ArrowRight aria-hidden="true" size={16} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="beitraege" className="bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Neue Beiträge"
            title="Aktuelle Ratgeberbeiträge"
            text="Jeder Beitrag ist als eigenständige SEO-Landingpage geschrieben und verlinkt sinnvoll auf Leistungen, Einsatzgebiete und den Anfrage-Funnel."
          />
          <div className="mt-9 grid gap-5 lg:grid-cols-2">
            {blogPosts.map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        </div>
      </section>

      <CTASection
        title="Vom Ratgeber zur konkreten Objektbetreuung"
        text="Wenn Sie schon wissen, welche Themen relevant sind, können Sie den Bedarf direkt im Service-Konfigurator zusammenstellen."
        label="Service konfigurieren"
      />
      <SEOJsonLd
        data={graph([
          breadcrumbSchema([
            { name: "Startseite", href: "/" },
            { name: "Ratgeber", href: "/ratgeber" },
          ]),
        ])}
      />
    </main>
  );
}
