import { z } from "zod";
import { PRESET_KEYS } from "@fala/shared";
import { PENDING_PREFIX } from "./pending";
import { FEATURE_SLUGS, HUB_SLUGS, SLUG_PATTERN, TOOL_SLUGS } from "./routes";

/**
 * One schema per page type (docs/PSEO_PLAN.md, sections 3.1 and 5). Every content file
 * is checked against its schema at build time; the loader names the file and field.
 */

/** Required, non-empty text. */
const text = () =>
  z.string({ error: (issue) => (issue.input === undefined ? "is required" : "must be text") }).trim().min(1, { error: "must not be empty" });

/** Text that has to fit a length limit (titles, descriptions). */
const limited = (max: number) => text().max(max, { error: `must be ${max} characters or fewer` });

const slug = () => text().regex(SLUG_PATTERN, { error: "must be lowercase words joined by hyphens" });

const list = <T extends z.ZodType>(item: T, min: number, max?: number) => {
  const base = z.array(item, { error: (issue) => (issue.input === undefined ? "is required" : "must be a list") }).min(min, {
    error: `needs at least ${min} item${min === 1 ? "" : "s"}`,
  });
  return max === undefined ? base : base.max(max, { error: `allows at most ${max} items` });
};

const object = <T extends z.ZodRawShape>(shape: T) =>
  z.strictObject(shape, {
    error: (issue) => {
      if (issue.code === "unrecognized_keys") return `has unknown field${issue.keys.length === 1 ? "" : "s"} ${issue.keys.map((key) => `"${key}"`).join(", ")}`;
      return issue.input === undefined ? "is required" : "must be an object";
    },
  });

/** A pending marker, or a real image/video served from /public. */
const pendingText = z.string().trim().startsWith(PENDING_PREFIX);
export const assetSchema = z.union(
  [
    pendingText,
    object({
      src: text().regex(/^\/[^\s]+\.(?:png|jpe?g|webp|avif|mp4|webm)$/, { error: "must be a /public path to an image or video" }),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      alt: text(),
    }),
  ],
  { error: `must be a "${PENDING_PREFIX} …" marker or { src, width, height, alt }` },
);
export type Asset = z.infer<typeof assetSchema>;

const sectionSchema = object({ heading: text(), paragraphs: list(text(), 1) });
export type Section = z.infer<typeof sectionSchema>;

const ctaSchema = object({ heading: text(), text: text() });

const shared = {
  status: z.enum(["draft", "published"], { error: 'must be "draft" or "published"' }),
  /** The <title>, used as is (no " · Supertitle" suffix). */
  title: limited(60),
  metaDescription: limited(155),
  h1: text(),
  primaryKeyword: text(),
  intro: text(),
  faq: list(object({ question: text(), answer: text() }), 3, 5),
  /** Slugs of 3 to 4 other pages. */
  related: list(slug(), 3, 4),
};

/** Fields every page except hubs has. */
const child = {
  ...shared,
  /** One line on the hub card and in "Related" blocks. */
  summary: limited(140),
  /** The closing call to action (the button always goes to sign-up). */
  cta: ctaSchema,
};

const hub = {
  ...shared,
  /** The hub's link text in the footer and breadcrumbs. */
  navLabel: limited(30),
};

/** Hubs that list their child pages. */
const listingHubSchema = object({
  ...hub,
  slug: z.enum(["alternatives", "captions-for", "tools"]),
});

/** The styles hub: a gallery of the presets (child style pages come in a later wave). */
const stylesHubSchema = object({
  ...hub,
  slug: z.literal("styles"),
  /** One or two sentences per preset, for the gallery. */
  presets: z.record(z.enum(PRESET_KEYS), text(), { error: (issue) => (issue.input === undefined ? "is required" : `needs a description for each of ${PRESET_KEYS.join(", ")}`) }),
});

export const hubSchema = z.discriminatedUnion("slug", [listingHubSchema, stylesHubSchema], {
  error: `slug must be one of ${HUB_SLUGS.join(", ")}`,
});

const competitorCell = text();

export const alternativeSchema = object({
  ...child,
  slug: slug(),
  competitor: text(),
  verdict: text(),
  /** The competitor's column; Supertitle's column comes from the codebase (lib/pseo/facts.ts). */
  comparisonTable: object({
    startingPaidPrice: competitorCell,
    freeTierLimits: competitorCell,
    freeWatermark: competitorCell,
    limitsCountedBy: competitorCell,
    platform: competitorCell,
    editingModel: competitorCell,
  }),
  /** When the competitor column was checked against their own sites, e.g. "November 2026". */
  comparisonCheckedOn: text(),
  whereTheyWin: list(text(), 2),
  switchingSteps: list(object({ title: text(), text: text() }), 3, 3),
});

export const platformSchema = object({
  ...child,
  slug: slug(),
  platform: text(),
  specs: object({ aspectRatio: text(), maxLength: text(), resolution: text() }),
  safeZone: object({ description: text(), screenshot: assetSchema }),
  /** How the platform's own captions differ from burned-in ones, one row per aspect. */
  nativeComparison: list(object({ aspect: text(), native: text(), burnedIn: text() }), 3),
  recommendedPreset: object({
    preset: z.enum(PRESET_KEYS, { error: `must be one of ${PRESET_KEYS.join(", ")}` }),
    reason: text(),
  }),
  presetPreview: assetSchema,
  /** Shape of the static style preview next to the recommended preset. */
  previewFrame: z.enum(["9:16", "1:1", "16:9"], { error: 'must be "9:16", "1:1" or "16:9"' }),
});

const burnInSchema = object({
  ...child,
  slug: z.literal("burn-in-subtitles"),
  openVsClosed: list(sectionSchema, 2),
  beforeAfter: assetSchema,
  whyBurnedIn: sectionSchema,
});

const noWatermarkSchema = object({
  ...child,
  slug: z.literal("caption-generator-no-watermark"),
  sampleExport: assetSchema,
  competitorWatermarks: list(object({ competitor: text(), policy: text() }), 1),
  /** When the competitors' policies were checked, e.g. "November 2026". */
  competitorsCheckedOn: text(),
  sections: list(sectionSchema, 1),
});

export const featureSchema = z.discriminatedUnion("slug", [burnInSchema, noWatermarkSchema], {
  error: `slug must be one of ${FEATURE_SLUGS.join(", ")}`,
});

export const toolSchema = object({
  ...child,
  slug: z.enum(TOOL_SLUGS, { error: `must be one of ${TOOL_SLUGS.join(", ")}` }),
  /** The short explanation of the two formats below the tool. */
  formats: list(sectionSchema, 2),
});

export const SCHEMAS = {
  hub: hubSchema,
  alternative: alternativeSchema,
  feature: featureSchema,
  platform: platformSchema,
  tool: toolSchema,
} as const;

export type HubContent = z.infer<typeof hubSchema>;
export type AlternativeContent = z.infer<typeof alternativeSchema>;
export type FeatureContent = z.infer<typeof featureSchema>;
export type BurnInContent = z.infer<typeof burnInSchema>;
export type NoWatermarkContent = z.infer<typeof noWatermarkSchema>;
export type PlatformContent = z.infer<typeof platformSchema>;
export type ToolContent = z.infer<typeof toolSchema>;
