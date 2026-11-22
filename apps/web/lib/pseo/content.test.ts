import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PLANS } from "@fala/shared";
import { CONTENT_FILES, PAGES, footerHubs, hubChildren, hubOf, relatedPages } from "./content";
import { loadPages, PseoContentError, type ContentFile } from "./load";
import { breadcrumbs } from "./seo";
import submagic from "../../content/pseo/alternatives/submagic.json";
import tiktok from "../../content/pseo/platforms/tiktok.json";
import burnIn from "../../content/pseo/features/burn-in-subtitles.json";
import srtToVtt from "../../content/pseo/tools/srt-to-vtt.json";
import toolsHub from "../../content/pseo/hubs/tools.json";

const contentRoot = path.resolve(import.meta.dirname, "../../content/pseo");

const FIXTURE_SLUGS = ["submagic", "tiktok", "burn-in-subtitles", "srt-to-vtt"];

/** Links only to pages that are in the fixture. */
function withLinks<T extends { slug: string }>(data: T): T {
  return { ...data, related: FIXTURE_SLUGS.filter((slug) => slug !== data.slug).slice(0, 3) };
}

/** A small valid set of files, where the tool page can be broken one field at a time. */
function fixture(toolOverrides: Record<string, unknown> = {}, toolFile = "tools/srt-to-vtt.json"): ContentFile[] {
  return [
    { file: "hubs/tools.json", type: "hub", data: withLinks(toolsHub) },
    { file: "alternatives/submagic.json", type: "alternative", data: withLinks(submagic) },
    { file: "platforms/tiktok.json", type: "platform", data: withLinks(tiktok) },
    { file: "features/burn-in-subtitles.json", type: "feature", data: withLinks(burnIn) },
    { file: toolFile, type: "tool", data: { ...withLinks(srtToVtt), ...toolOverrides } },
  ];
}

function issuesOf(files: ContentFile[]): string[] {
  try {
    loadPages(files);
  } catch (error) {
    if (error instanceof PseoContentError) return error.issues;
    throw error;
  }
  return [];
}

describe("pSEO content", () => {
  it("registers every content file in the folder", () => {
    const onDisk = readdirSync(contentRoot, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.split(path.sep).join("/"))
      .sort();
    expect(CONTENT_FILES.map((entry) => entry.file).sort()).toEqual(onDisk);
  });

  it("loads the real content", () => {
    expect(PAGES.length).toBe(CONTENT_FILES.length);
    for (const page of PAGES) {
      expect(page.title.length).toBeLessThanOrEqual(60);
      expect(page.metaDescription.length).toBeLessThanOrEqual(155);
      expect(page.path).toMatch(/^\/[a-z0-9/-]+$/);
      expect(page.path).not.toMatch(/\/$/);
    }
  });

  it("fills plan tokens from the codebase", () => {
    const page = PAGES.find((candidate) => candidate.slug === "submagic")!;
    const answer = page.faq.find((item) => item.question === "Is Supertitle free?")!.answer;
    expect(answer).toContain(`${PLANS.free.monthlyMinutes} minutes of video a month`);
    expect(answer).not.toContain("{plan.");
  });

  it("names the file and field when a required field is missing or empty", () => {
    const files = fixture();
    const alternative = files.find((entry) => entry.type === "alternative")!;
    delete (alternative.data as { verdict?: string }).verdict;
    const missing = issuesOf(files);
    expect(missing).toEqual([`apps/web/content/pseo/alternatives/submagic.json: field "verdict" is required`]);

    const empty = issuesOf(fixture({ intro: "   " }));
    expect(empty).toEqual([`apps/web/content/pseo/tools/srt-to-vtt.json: field "intro" must not be empty`]);
  });

  it("rejects long titles, unknown fields, bad links, duplicates and unknown tokens", () => {
    expect(issuesOf(fixture({ title: "x".repeat(61) }))).toEqual([expect.stringContaining(`field "title" must be 60 characters or fewer`)]);
    expect(issuesOf(fixture({ verdikt: "typo" }))[0]).toContain("verdikt");
    expect(issuesOf(fixture({ related: ["submagic", "tiktok", "nope"] }))).toEqual([expect.stringContaining(`"related.2" points to "nope"`)]);
    expect(issuesOf(fixture({ related: ["submagic", "tiktok", "srt-to-vtt"] }))).toEqual([expect.stringContaining("points to the page itself")]);
    expect(issuesOf(fixture({ h1: tiktok.h1 }))).toEqual([expect.stringContaining(`field "h1" is the same as in`)]);
    expect(issuesOf(fixture({ intro: "{plan.free.watermark} {plan.gold.name}" }))).toHaveLength(2);
    expect(issuesOf(fixture({}, "tools/wrong-name.json"))).toEqual([expect.stringContaining(`must be "srt-to-vtt.json"`)]);
  });

  it("keeps pages with a pending marker or a draft status out of the index", () => {
    const pages = loadPages(fixture({ status: "draft" }));
    const tool = pages.find((page) => page.slug === "srt-to-vtt")!;
    expect(tool).toMatchObject({ listed: false, indexable: false });

    // A published page is indexable exactly when it has no pending marker.
    for (const page of pages.filter((candidate) => candidate.listed)) {
      expect(page.indexable, page.path).toBe(page.pending.length === 0);
    }

    const pendingTitle = loadPages(fixture({ intro: "TODO(igor): an intro" })).find((page) => page.slug === "srt-to-vtt")!;
    expect(pendingTitle).toMatchObject({ listed: true, indexable: false, pending: [{ field: "intro", note: "an intro" }] });
  });

  it("links hubs, related pages and the footer to published pages only", () => {
    expect(hubChildren("tools").map((page) => page.slug)).toContain("srt-to-vtt");
    expect(footerHubs().every((hub) => hub.listed)).toBe(true);
    for (const page of PAGES) expect(relatedPages(page).every((other) => other.listed)).toBe(true);
  });
});

/** docs/PSEO_PLAN.md, section 4: URLs, keywords and title tags are final. */
const WAVE_1: [path: string, keyword: string, title: string][] = [
  ["/alternatives", "caption tool alternatives", "Supertitle Alternatives & Comparisons"],
  ["/captions-for", "captions for social video", "Captions for TikTok, Reels, Shorts & More"],
  ["/styles", "caption styles", "Caption Styles for Short Videos"],
  ["/tools", "free subtitle tools", "Free Subtitle & Caption Tools"],
  ["/alternatives/submagic", "submagic alternative", "Submagic Alternative Without Per-Video Caps"],
  ["/alternatives/captions-ai", "captions ai alternative", "Captions.ai Alternative That Works in the Browser"],
  ["/alternatives/capcut", "capcut alternative for captions", "CapCut Alternative for Auto Captions (No Timeline)"],
  ["/alternatives/veed", "veed alternative", "VEED Alternative for Fast Burned-In Captions"],
  ["/caption-generator-no-watermark", "caption generator no watermark", "Free Caption Generator With No Watermark"],
  ["/burn-in-subtitles", "burn subtitles into video", "Burn Subtitles Into Video Online (MP4)"],
  ["/captions-for/tiktok", "add captions to tiktok video", "Add Captions to TikTok Videos"],
  ["/captions-for/instagram-reels", "add captions to reels", "Add Captions to Instagram Reels Automatically"],
  ["/captions-for/youtube-shorts", "add captions to youtube shorts", "Add Captions to YouTube Shorts (Burned-In)"],
  ["/captions-for/linkedin-video", "add captions to linkedin video", "Add Captions to LinkedIn Videos"],
  ["/tools/srt-to-vtt", "srt to vtt", "SRT to VTT Converter (Free, In Your Browser)"],
  ["/tools/vtt-to-srt", "vtt to srt", "VTT to SRT Converter (Free, In Your Browser)"],
];

describe("wave 1", () => {
  it("has exactly the 16 pages of the plan, with their final keywords and titles", () => {
    expect(PAGES.map((page) => [page.path, page.primaryKeyword, page.title]).sort()).toEqual([...WAVE_1].sort());
    expect(PAGES.every((page) => page.status === "published")).toBe(true);
  });

  it("links every child page to its hub and to at least three related pages", () => {
    for (const page of PAGES.filter((candidate) => candidate.type !== "hub")) {
      const crumbs = breadcrumbs(page).map((crumb) => crumb.path);
      // Feature pages have no hub: their breadcrumbs go straight to Home.
      if (page.type !== "feature") expect(crumbs, page.path).toContain(hubOf(page)?.path);
      expect(relatedPages(page).length, page.path).toBeGreaterThanOrEqual(3);
    }
  });

  it("links every hub to all of its children, and shows the four hubs in the footer", () => {
    expect(hubChildren("alternatives").map((page) => page.slug)).toEqual(["submagic", "captions-ai", "capcut", "veed"]);
    expect(hubChildren("captions-for").map((page) => page.slug)).toEqual(["tiktok", "instagram-reels", "youtube-shorts", "linkedin-video"]);
    expect(hubChildren("tools").map((page) => page.slug)).toEqual(["srt-to-vtt", "vtt-to-srt"]);
    expect(footerHubs().map((hub) => hub.path)).toEqual(["/alternatives", "/captions-for", "/styles", "/tools"]);
  });

  it("recommends Minimal or Classic on LinkedIn", () => {
    const linkedin = PAGES.find((page) => page.slug === "linkedin-video");
    if (linkedin?.type !== "platform") throw new Error("linkedin-video should be a platform page");
    expect(["minimal", "classic"]).toContain(linkedin.recommendedPreset.preset);
  });
});
