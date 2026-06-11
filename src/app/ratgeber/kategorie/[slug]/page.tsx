import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogCard } from "@/components/BlogCard";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CTASection } from "@/components/CTASection";
import { SectionHeading } from "@/components/SectionHeading";
import { SEOJsonLd } from "@/components/SEOJsonLd";
import { blogCategories, findBlogCategory, postsForCategory } from "@/lib/site";
import { breadcrumbSchema, graph, metadataForPage } from "@/lib/seo";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return blogCategories.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = findBlogCategory(slug);

  if (!category) return {};

  return metadataForPage({
    title: `${category.label} Ratgeber Hannover | Hausvia`,
    description: category.description,
    path: `/ratgeber/kategorie/${category.slug}`,
  });
}

export default async function RatgeberKategoriePage({ params }: PageProps) {
  const { slug } = await params;
  const category = findBlogCategory(slug);

  if (!category) {
    notFound();
  }

  const posts = postsForCategory(category.slug);

  return (
    <main>
      <Breadcrumbs
        items={[
          { label: "Startseite", href: "/" },
          { label: "Ratgeber", href: "/ratgeber" },
          { label: category.label, href: `/ratgeber/kategorie/${category.slug}` },
        ]}
      />
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <p className="text-sm font-bold uppercase tracking-wide text-brand">Ratgeber Kategorie</p>
          <h1 className="mt-3 max-w-4xl text-[2rem] font-extrabold leading-[1.1] text-slate-950 sm:text-[2.5rem] md:text-[2.75rem] lg:text-[3.25rem]">
            {category.label} Ratgeber für Hannover
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-700">{category.description}</p>
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading title={`Beiträge in ${category.label}`} />
          <div className="mt-9 grid gap-5 lg:grid-cols-2">
            {posts.map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        </div>
      </section>

      <CTASection
        title="Passende Betreuung zum Thema anfragen"
        text="Hausvia übersetzt den Ratgeber-Kontext in eine konkrete Anfrage für Ihr Objekt."
        label="Kostenlose Anfrage starten"
      />
      <SEOJsonLd
        data={graph([
          breadcrumbSchema([
            { name: "Startseite", href: "/" },
            { name: "Ratgeber", href: "/ratgeber" },
            { name: category.label, href: `/ratgeber/kategorie/${category.slug}` },
          ]),
        ])}
      />
    </main>
  );
}
