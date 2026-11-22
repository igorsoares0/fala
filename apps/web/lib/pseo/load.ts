import { fillPlanTokens } from "./facts";
import { findPending, isPending, type PendingMarker } from "./pending";
import { pagePath, type PageType } from "./routes";
import {
  SCHEMAS,
  type AlternativeContent,
  type FeatureContent,
  type HubContent,
  type PlatformContent,
  type ToolContent,
} from "./schema";

/** A content file as registered in lib/pseo/content.ts, before validation. */
export type ContentFile = { file: string; type: PageType; data: unknown };

type PageMeta = {
  /** Path of the content file, for messages. */
  file: string;
  path: string;
  pending: PendingMarker[];
  /** Linked from hubs, "Related" blocks and the footer. */
  listed: boolean;
  /** Published with no pending marker: indexable and in the sitemap. */
  indexable: boolean;
};

export type HubPage = HubContent & PageMeta & { type: "hub" };
export type AlternativePage = AlternativeContent & PageMeta & { type: "alternative" };
export type FeaturePage = FeatureContent & PageMeta & { type: "feature" };
export type PlatformPage = PlatformContent & PageMeta & { type: "platform" };
export type ToolPage = ToolContent & PageMeta & { type: "tool" };
export type PseoPage = HubPage | AlternativePage | FeaturePage | PlatformPage | ToolPage;

export const CONTENT_DIR = "apps/web/content/pseo";

export class PseoContentError extends Error {
  constructor(readonly issues: string[]) {
    super(`pSEO content is invalid (${issues.length} issue${issues.length === 1 ? "" : "s"}):\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "PseoContentError";
  }
}

/** Fills the plan tokens in every string of a content value. */
function fillTokens(value: unknown, unknown: string[]): unknown {
  if (typeof value === "string") {
    const filled = fillPlanTokens(value);
    unknown.push(...filled.unknown);
    return filled.text;
  }
  if (Array.isArray(value)) return value.map((item) => fillTokens(item, unknown));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fillTokens(item, unknown)]));
  }
  return value;
}

/**
 * Validates every content file and the links between them. Throws a PseoContentError
 * naming each file and field at fault, which fails `next build`.
 */
export function loadPages(files: ContentFile[]): PseoPage[] {
  const issues: string[] = [];
  const pages: PseoPage[] = [];
  /** Slugs of files that failed validation: links to them aren't reported again. */
  const invalidSlugs = new Set<string>();

  for (const { file, type, data } of files) {
    const where = `${CONTENT_DIR}/${file}`;
    const unknownTokens: string[] = [];
    const filled = fillTokens(data, unknownTokens);
    for (const token of new Set(unknownTokens)) issues.push(`${where}: unknown plan token ${token}`);

    const parsed = SCHEMAS[type].safeParse(filled);
    if (!parsed.success) {
      const rawSlug = (data as { slug?: unknown } | null)?.slug;
      if (typeof rawSlug === "string") invalidSlugs.add(rawSlug);
      for (const issue of parsed.error.issues) {
        const field = issue.path.map(String).join(".");
        issues.push(`${where}: ${field ? `field "${field}" ` : ""}${issue.message}`);
      }
      continue;
    }

    const content = parsed.data;
    const fileName = file.split("/").pop();
    if (fileName !== `${content.slug}.json`) issues.push(`${where}: file name must be "${content.slug}.json" to match its slug`);

    const pending = findPending(content);
    const listed = content.status === "published";
    pages.push({
      ...content,
      type,
      file: where,
      path: pagePath(type, content.slug),
      pending,
      listed,
      indexable: listed && pending.length === 0,
    } as PseoPage);
  }

  issues.push(...crossCheck(pages, invalidSlugs));
  if (issues.length > 0) throw new PseoContentError(issues);
  return pages;
}

/** Checks that need every page: unique slugs and copy, and links that resolve. */
function crossCheck(pages: PseoPage[], invalidSlugs: Set<string>): string[] {
  const issues: string[] = [];
  const bySlug = new Map<string, PseoPage>();
  for (const page of pages) {
    const other = bySlug.get(page.slug);
    if (other) issues.push(`${page.file}: slug "${page.slug}" is already used by ${other.file}`);
    else bySlug.set(page.slug, page);
  }

  for (const page of pages) {
    const seen = new Set<string>();
    page.related.forEach((slug, index) => {
      const field = `field "related.${index}"`;
      if (slug === page.slug) issues.push(`${page.file}: ${field} points to the page itself`);
      else if (!bySlug.has(slug) && !invalidSlugs.has(slug)) issues.push(`${page.file}: ${field} points to "${slug}", which has no content file`);
      else if (seen.has(slug)) issues.push(`${page.file}: ${field} repeats "${slug}"`);
      seen.add(slug);
    });
  }

  // No two pages may share a title, meta description, H1 or intro (pending markers aside).
  for (const field of ["title", "metaDescription", "h1", "intro"] as const) {
    const owners = new Map<string, PseoPage>();
    for (const page of pages) {
      if (isPending(page[field])) continue;
      const value = page[field].trim().toLowerCase();
      const owner = owners.get(value);
      if (owner) issues.push(`${page.file}: field "${field}" is the same as in ${owner.file}`);
      else owners.set(value, page);
    }
  }
  return issues;
}
