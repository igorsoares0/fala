import type { MetadataRoute } from "next";
import { PAGES } from "@/lib/pseo/content";
import { absoluteUrl } from "@/lib/pseo/seo";

/** The public pages, plus every pSEO page that is published and has no pending marker. */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", "/terms", "/privacy", "/refunds", ...PAGES.filter((page) => page.indexable).map((page) => page.path)];
  return paths.map((path) => ({ url: absoluteUrl(path) }));
}
