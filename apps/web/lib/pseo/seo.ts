import type { Metadata } from "next";
import { PLAN_KEYS, PLANS } from "@fala/shared";
import { hubOf } from "./content";
import type { PseoPage } from "./load";

/** The public origin, baked in at build time (APP_URL is a Coolify build variable). */
export function siteUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function absoluteUrl(path: string): string {
  return path === "/" ? siteUrl() : `${siteUrl()}${path}`;
}

/** Title, description, canonical, Open Graph, Twitter card and robots of a pSEO page. */
export function pageMetadata(page: PseoPage): Metadata {
  const url = absoluteUrl(page.path);
  return {
    title: { absolute: page.title },
    description: page.metaDescription,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: "Supertitle", url, title: page.title, description: page.metaDescription },
    twitter: { card: "summary", title: page.title, description: page.metaDescription },
    // Drafts and pages with a pending marker stay reachable but out of search results.
    robots: page.indexable ? undefined : { index: false, follow: true },
  };
}

export type Crumb = { name: string; path: string };

/** Home › hub › page (features sit right under Home). Hubs have no breadcrumbs. */
export function breadcrumbs(page: PseoPage): Crumb[] {
  if (page.type === "hub") return [];
  const hub = hubOf(page);
  return [{ name: "Home", path: "/" }, ...(hub ? [{ name: hub.navLabel, path: hub.path }] : []), { name: page.h1, path: page.path }];
}

type JsonLdNode = Record<string, unknown>;

function softwareApplication(page: PseoPage): JsonLdNode {
  return {
    "@type": "SoftwareApplication",
    name: "Supertitle",
    url: siteUrl(),
    description: page.metaDescription,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web browser",
    offers: PLAN_KEYS.map((key) => ({
      "@type": "Offer",
      name: PLANS[key].name,
      price: String(PLANS[key].monthlyUsd),
      priceCurrency: "USD",
    })),
  };
}

function faqPage(page: PseoPage): JsonLdNode {
  return {
    "@type": "FAQPage",
    mainEntity: page.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

function breadcrumbList(crumbs: Crumb[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/**
 * Structured data: SoftwareApplication on feature, platform and alternative pages,
 * FAQPage everywhere (every template renders the FAQ), BreadcrumbList on every non-hub page.
 */
export function pageJsonLd(page: PseoPage): JsonLdNode {
  const graph: JsonLdNode[] = [];
  if (page.type === "feature" || page.type === "platform" || page.type === "alternative") graph.push(softwareApplication(page));
  graph.push(faqPage(page));
  const crumbs = breadcrumbs(page);
  if (crumbs.length > 0) graph.push(breadcrumbList(crumbs));
  return { "@context": "https://schema.org", "@graph": graph };
}

/** JSON for an inline <script>, with `<` escaped so content can't close the tag. */
export function serializeJsonLd(data: JsonLdNode): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
