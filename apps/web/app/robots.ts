import type { MetadataRoute } from "next";
import { FEATURE_SLUGS, HUB_SLUGS } from "@/lib/pseo/routes";
import { absoluteUrl } from "@/lib/pseo/seo";

/** Only the public website (landing, policies and the pSEO pages) is meant for search engines. */
export default function robots(): MetadataRoute.Robots {
  const pseo = [...HUB_SLUGS, ...FEATURE_SLUGS].map((slug) => `/${slug}`);
  return {
    rules: { userAgent: "*", allow: ["/$", "/terms", "/privacy", "/refunds", ...pseo], disallow: ["/projects", "/billing", "/account", "/api/"] },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
