import type { MetadataRoute } from "next";
import { allSeoPaths, blogCategories, blogPosts, locationPages, marketingPages } from "@/lib/site";
import { serviceLandingPages } from "@/lib/serviceLandingPages";
import { absoluteUrl } from "@/lib/seo";

const siteUpdatedAt = new Date("2026-06-11");

function changeFrequencyFor(path: string): MetadataRoute.Sitemap[number]["changeFrequency"] {
  if (path === "/" || path === "/ratgeber") return "weekly";
  if (path.startsWith("/ratgeber/")) return "monthly";
  if (path.startsWith("/einsatzgebiete/")) return "monthly";
  if (path.startsWith("/leistungen/")) return "monthly";
  if (["/datenschutz", "/impressum", "/agb"].includes(path)) return "yearly";
  return "monthly";
}

function priorityFor(path: string) {
  const coreServiceSlugs = new Set(marketingPages.slice(0, 3).map((page) => `/${page.slug}`));

  if (path === "/") return 1;
  if (path === "/angebot-anfragen") return 0.94;
  if (coreServiceSlugs.has(path)) return 0.92;
  if (path === "/einsatzgebiete" || path === "/kontakt") return 0.86;
  if (path.startsWith("/leistungen/")) return 0.82;
  if (path.startsWith("/einsatzgebiete/")) return 0.8;
  if (path.startsWith("/ratgeber/")) return 0.74;
  if (["/datenschutz", "/impressum", "/agb"].includes(path)) return 0.25;
  return 0.78;
}

function lastModifiedFor(path: string) {
  const blogPost = blogPosts.find((post) => path === `/ratgeber/${post.slug}`);

  if (blogPost) return new Date(blogPost.updatedAt);
  if (blogCategories.some((category) => path === `/ratgeber/kategorie/${category.slug}`)) return siteUpdatedAt;
  if (locationPages.some((page) => path === `/einsatzgebiete/${page.slug}`)) return siteUpdatedAt;
  if (serviceLandingPages.some((page) => path === `/leistungen/${page.slug}`)) return siteUpdatedAt;

  return siteUpdatedAt;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [...allSeoPaths, ...serviceLandingPages.map((page) => `/leistungen/${page.slug}`)];

  return paths.map((path) => ({
    url: absoluteUrl(path),
    lastModified: lastModifiedFor(path),
    changeFrequency: changeFrequencyFor(path),
    priority: priorityFor(path),
  }));
}
