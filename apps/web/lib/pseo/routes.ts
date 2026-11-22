/**
 * URL shapes of the programmatic SEO pages (docs/PSEO_PLAN.md). Kept free of content
 * imports so the proxy can use it without loading every page.
 */

export const PAGE_TYPES = ["hub", "alternative", "feature", "platform", "tool"] as const;
export type PageType = (typeof PAGE_TYPES)[number];

/** Hubs live at /<slug>. */
export const HUB_SLUGS = ["alternatives", "captions-for", "styles", "tools"] as const;
export type HubSlug = (typeof HUB_SLUGS)[number];

/** Feature pages live at the root, so each one has its own route folder. */
export const FEATURE_SLUGS = ["burn-in-subtitles", "caption-generator-no-watermark"] as const;
export type FeatureSlug = (typeof FEATURE_SLUGS)[number];

/** Tool pages: each slug has a converter in lib/pseo/subtitles.ts. */
export const TOOL_SLUGS = ["srt-to-vtt", "vtt-to-srt"] as const;
export type ToolSlug = (typeof TOOL_SLUGS)[number];

/** The hub that lists each child type. Feature pages have no hub. */
export const HUB_OF: Record<Exclude<PageType, "hub" | "feature">, HubSlug> = {
  alternative: "alternatives",
  platform: "captions-for",
  tool: "tools",
};

/** Lowercase words joined by single hyphens: no uppercase, no trailing slash. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function pagePath(type: PageType, slug: string): string {
  if (type === "hub" || type === "feature") return `/${slug}`;
  return `/${HUB_OF[type]}/${slug}`;
}

const SECTION_PREFIXES = HUB_SLUGS.map((slug) => `/${slug}`);
const FEATURE_PATHS = new Set<string>(FEATURE_SLUGS.map((slug) => `/${slug}`));

/** Whether a pathname belongs to the public pSEO pages (hubs, their children, features). */
export function isPseoPath(pathname: string): boolean {
  if (FEATURE_PATHS.has(pathname)) return true;
  return SECTION_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
