/**
 * The pSEO pages: every content file under content/pseo, registered here and validated
 * when this module loads (so a bad file fails `next build`). A test checks that no
 * file in the folder is left unregistered.
 */
import capcut from "../../content/pseo/alternatives/capcut.json";
import captionsAi from "../../content/pseo/alternatives/captions-ai.json";
import submagic from "../../content/pseo/alternatives/submagic.json";
import veed from "../../content/pseo/alternatives/veed.json";
import burnInSubtitles from "../../content/pseo/features/burn-in-subtitles.json";
import captionGeneratorNoWatermark from "../../content/pseo/features/caption-generator-no-watermark.json";
import alternativesHub from "../../content/pseo/hubs/alternatives.json";
import captionsForHub from "../../content/pseo/hubs/captions-for.json";
import stylesHub from "../../content/pseo/hubs/styles.json";
import toolsHub from "../../content/pseo/hubs/tools.json";
import instagramReels from "../../content/pseo/platforms/instagram-reels.json";
import linkedinVideo from "../../content/pseo/platforms/linkedin-video.json";
import tiktok from "../../content/pseo/platforms/tiktok.json";
import youtubeShorts from "../../content/pseo/platforms/youtube-shorts.json";
import srtToVtt from "../../content/pseo/tools/srt-to-vtt.json";
import vttToSrt from "../../content/pseo/tools/vtt-to-srt.json";
import { loadPages, type ContentFile, type PseoPage } from "./load";
import { HUB_OF, type HubSlug, type PageType } from "./routes";

export const CONTENT_FILES: ContentFile[] = [
  { file: "hubs/alternatives.json", type: "hub", data: alternativesHub },
  { file: "hubs/captions-for.json", type: "hub", data: captionsForHub },
  { file: "hubs/styles.json", type: "hub", data: stylesHub },
  { file: "hubs/tools.json", type: "hub", data: toolsHub },
  { file: "alternatives/submagic.json", type: "alternative", data: submagic },
  { file: "alternatives/captions-ai.json", type: "alternative", data: captionsAi },
  { file: "alternatives/capcut.json", type: "alternative", data: capcut },
  { file: "alternatives/veed.json", type: "alternative", data: veed },
  { file: "features/burn-in-subtitles.json", type: "feature", data: burnInSubtitles },
  { file: "features/caption-generator-no-watermark.json", type: "feature", data: captionGeneratorNoWatermark },
  { file: "platforms/tiktok.json", type: "platform", data: tiktok },
  { file: "platforms/instagram-reels.json", type: "platform", data: instagramReels },
  { file: "platforms/youtube-shorts.json", type: "platform", data: youtubeShorts },
  { file: "platforms/linkedin-video.json", type: "platform", data: linkedinVideo },
  { file: "tools/srt-to-vtt.json", type: "tool", data: srtToVtt },
  { file: "tools/vtt-to-srt.json", type: "tool", data: vttToSrt },
];

export const PAGES: PseoPage[] = loadPages(CONTENT_FILES);

type PageOf<T extends PageType> = Extract<PseoPage, { type: T }>;

export function pagesOfType<T extends PageType>(type: T): PageOf<T>[] {
  return PAGES.filter((page): page is PageOf<T> => page.type === type);
}

export function findPage<T extends PageType>(type: T, slug: string): PageOf<T> | undefined {
  return pagesOfType(type).find((page) => page.slug === slug);
}

export function pageBySlug(slug: string): PseoPage | undefined {
  return PAGES.find((page) => page.slug === slug);
}

/** The hub a child page sits under, if that hub has content. */
export function hubOf(page: PseoPage) {
  if (page.type === "hub" || page.type === "feature") return undefined;
  return findPage("hub", HUB_OF[page.type]);
}

/** Published pages a hub lists, in content order. */
export function hubChildren(hub: HubSlug): PseoPage[] {
  const type = (Object.keys(HUB_OF) as (keyof typeof HUB_OF)[]).find((key) => HUB_OF[key] === hub);
  return type ? pagesOfType(type).filter((page) => page.listed) : [];
}

/** The page's "Related" links, leaving out drafts. */
export function relatedPages(page: PseoPage): PseoPage[] {
  return page.related.map(pageBySlug).filter((other): other is PseoPage => Boolean(other?.listed));
}

/** Hubs shown in the site footer. */
export function footerHubs() {
  return pagesOfType("hub").filter((hub) => hub.listed);
}

/** Card text for a page in hubs and "Related" blocks. */
export function cardText(page: PseoPage): string {
  return page.type === "hub" ? page.metaDescription : page.summary;
}

/** A page a static route renders: its content file has to exist. */
export function requirePage<T extends PageType>(type: T, slug: string): PageOf<T> {
  const page = findPage(type, slug);
  if (!page) throw new Error(`No pSEO content for the ${type} page "${slug}" (expected a file under content/pseo).`);
  return page;
}

/** Every pSEO URL with a content file, drafts included (they're reachable, just noindex). */
export const PSEO_PATHS: ReadonlySet<string> = new Set(PAGES.map((page) => page.path));
