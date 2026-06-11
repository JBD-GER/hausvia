import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocationPageView } from "@/components/LocationPageView";
import { SEOJsonLd } from "@/components/SEOJsonLd";
import { findLocationPage, locationPages } from "@/lib/site";
import { breadcrumbSchema, faqSchema, graph, metadataForPage, serviceSchema } from "@/lib/seo";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return locationPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = findLocationPage(slug);

  if (!page) return {};

  return metadataForPage({
    title: page.title,
    description: page.description,
    path: `/einsatzgebiete/${page.slug}`,
    image: page.image,
  });
}

export default async function LocationPage({ params }: PageProps) {
  const { slug } = await params;
  const page = findLocationPage(slug);

  if (!page) {
    notFound();
  }

  return (
    <>
      <LocationPageView page={page} />
      <SEOJsonLd
        data={graph([
          breadcrumbSchema([
            { name: "Startseite", href: "/" },
            { name: "Einsatzgebiete", href: "/einsatzgebiete" },
            { name: page.h1, href: `/einsatzgebiete/${page.slug}` },
          ]),
          faqSchema(page.faq),
          serviceSchema({
            name: page.h1,
            description: page.description,
            path: `/einsatzgebiete/${page.slug}`,
            serviceType: "Hausmeisterservice",
          }),
        ])}
      />
    </>
  );
}
