import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CTASection } from "@/components/CTASection";
import { FAQAccordion } from "@/components/FAQAccordion";
import { InternalLinks } from "@/components/InternalLinks";
import { SEOJsonLd } from "@/components/SEOJsonLd";
import { blogCategories, type BlogPost } from "@/lib/site";
import { articleSchema, breadcrumbSchema, faqSchema, graph } from "@/lib/seo";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

export function BlogPostView({ post }: { post: BlogPost }) {
  const category = blogCategories.find((item) => item.slug === post.category);

  return (
    <main>
      <Breadcrumbs
        items={[
          { label: "Startseite", href: "/" },
          { label: "Ratgeber", href: "/ratgeber" },
          { label: category?.label ?? "Kategorie", href: `/ratgeber/kategorie/${post.category}` },
          { label: post.h1, href: `/ratgeber/${post.slug}` },
        ]}
      />

      <article className="bg-white">
        <header className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
          <Link
            href={`/ratgeber/kategorie/${post.category}`}
            className="text-sm font-bold uppercase tracking-wide text-brand"
          >
            {category?.label ?? "Ratgeber"}
          </Link>
          <h1 className="mt-4 max-w-4xl text-[2rem] font-extrabold leading-[1.1] text-slate-950 sm:text-[2.5rem] md:text-[2.75rem] lg:text-[3.25rem]">
            {post.h1}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-700">{post.excerpt}</p>
          <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold text-slate-600">
            <span className="inline-flex items-center gap-2">
              <CalendarDays aria-hidden="true" className="h-4 w-4 text-brand" />
              Aktualisiert am {formatDate(post.updatedAt)}
            </span>
            <span className="inline-flex items-center gap-2">
              <Clock aria-hidden="true" className="h-4 w-4 text-brand" />
              {post.readTime}
            </span>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-4 pb-10 sm:px-6 lg:px-8">
          <Image
            src={post.image}
            alt={post.imageAlt}
            width={1400}
            height={788}
            priority
            sizes="(min-width: 1024px) 1100px, 100vw"
            className="aspect-video w-full rounded-lg border border-slate-200 object-cover shadow-sm"
          />
        </div>

        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 sm:px-6 lg:grid-cols-[260px_1fr] lg:px-8">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <nav className="rounded-lg border border-slate-200 bg-slate-50 p-5" aria-label="Inhaltsverzeichnis">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-950">Inhalt</h2>
              <ol className="mt-4 space-y-3 text-sm font-semibold text-slate-650">
                {post.sections.map((section) => (
                  <li key={section.title}>
                    <a href={`#${section.title.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, "-")}`} className="hover:text-brand">
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          <div className="min-w-0">
            <div className="space-y-5 text-lg leading-8 text-slate-750">
              {post.intro.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>

            <div className="mt-12 space-y-12">
              {post.sections.map((section) => (
                <section key={section.title} id={section.title.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, "-")}>
                  <h2 className="text-3xl font-extrabold leading-tight text-slate-950">{section.title}</h2>
                  {section.paragraphs?.map((paragraph) => (
                    <p key={paragraph} className="mt-4 text-base leading-8 text-slate-750">
                      {paragraph}
                    </p>
                  ))}
                  {section.items ? (
                    <ul className="mt-5 grid gap-3">
                      {section.items.map((item) => (
                        <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-7 text-slate-800">
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))}
            </div>

            <div className="mt-14 rounded-lg border border-brand/20 bg-brand-soft p-6">
              <h2 className="text-2xl font-extrabold text-slate-950">Passende Betreuung für Ihr Objekt prüfen</h2>
              <p className="mt-3 text-sm leading-7 text-slate-700">
                Stellen Sie Standort, Objektart und Leistungen in wenigen Schritten zusammen. Hausvia meldet sich mit
                einer passenden Einschätzung für Ihre Immobilie in Hannover und Umgebung.
              </p>
              <Link
                href="/angebot-anfragen"
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-bold text-white"
              >
                Kostenlose Anfrage starten
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </div>
          </div>
        </div>
      </article>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-slate-950">Häufige Fragen</h2>
          <div className="mt-8">
            <FAQAccordion items={post.faq} />
          </div>
        </div>
      </section>

      <InternalLinks links={post.internalLinks} title="Passende Seiten zum Thema" />
      <CTASection
        title="Ratgeber gelesen? Jetzt Bedarf konkret machen"
        text="Der Service-Konfigurator übersetzt Ihre Anforderungen in eine strukturierte Anfrage für Hausvia."
        label="Service zusammenstellen"
      />
      <SEOJsonLd
        data={graph([
          breadcrumbSchema([
            { name: "Startseite", href: "/" },
            { name: "Ratgeber", href: "/ratgeber" },
            { name: category?.label ?? "Kategorie", href: `/ratgeber/kategorie/${post.category}` },
            { name: post.h1, href: `/ratgeber/${post.slug}` },
          ]),
          articleSchema({
            title: post.h1,
            description: post.description,
            path: `/ratgeber/${post.slug}`,
            image: post.image,
            publishedAt: post.publishedAt,
            updatedAt: post.updatedAt,
          }),
          faqSchema(post.faq),
        ])}
      />
    </main>
  );
}
