import type { MetadataRoute } from "next";
import { allSeoPaths } from "@/lib/site";
import { serviceLandingPages } from "@/lib/serviceLandingPages";
import { absoluteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-06-09");
  const paths = [...allSeoPaths, ...serviceLandingPages.map((page) => `/leistungen/${page.slug}`)];

  return paths.map((path) => ({
    url: absoluteUrl(path),
    lastModified,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path.includes("einsatzgebiete/") ? 0.72 : 0.82,
  }));
}
