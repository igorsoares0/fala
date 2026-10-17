import type { MetadataRoute } from "next";

/** Only the public website is meant for search engines. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/$", "/terms", "/privacy", "/refunds"], disallow: ["/projects", "/billing", "/account", "/api/"] },
    sitemap: `${process.env.APP_URL ?? "http://localhost:3000"}/sitemap.xml`,
  };
}
