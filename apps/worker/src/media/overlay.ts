import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import {
  activeWordTransform,
  blockWords,
  CAPTION_FONT_FILES,
  CAPTION_FONT_WEIGHTS,
  captionBoxStyle,
  captionFrames,
  captionWordStyle,
  IDENTITY_TRANSFORM,
  interpolateTransform,
  overlayStateKey,
  transformCss,
  type CaptionStyle,
  type CaptionTrack,
  type CssMap,
  type OverlayState,
} from "@fala/shared";

/**
 * Draws the caption overlay with headless Chromium, using the exact CSS of the
 * editor preview (@fala/shared caption-render), and writes it as a sequence of
 * transparent PNGs plus an FFmpeg concat list with each picture's duration.
 * FFmpeg then composites it over the video (render.ts).
 *
 * Pictures only cover the band of the frame where captions can appear, which
 * keeps screenshots small and fast.
 */

const FONTS_DIR = path.resolve(import.meta.dirname, "../../../../packages/shared/fonts");

/** The caption face's CSS name inside the render page; anything it lacks falls back to the system's Noto fonts. */
const FONT_FAMILY = '"Fala Caption", "Noto Sans", sans-serif';

let browser: Promise<Browser> | null = null;

/** One Chromium per worker process, started on first use and restarted if it dies. */
function getBrowser(executablePath?: string): Promise<Browser> {
  browser ??= chromium.launch({ executablePath, headless: true }).then((instance) => {
    instance.on("disconnected", () => (browser = null));
    return instance;
  });
  // A failed launch shouldn't stick: the next job tries again.
  browser.catch(() => (browser = null));
  return browser;
}

export async function closeBrowser() {
  const current = browser;
  browser = null;
  await (await current?.catch(() => null))?.close();
}

export type Band = { x: number; y: number; width: number; height: number };

export type OverlayResult = {
  /** FFmpeg concat list of the pictures (`-f concat -i`). */
  listPath: string;
  /** Where the pictures go on the output frame. */
  band: Band;
  frameCount: number;
};

/** Chromium pages drawing one export's pictures at once, each over its own slice of the timeline. */
const OVERLAY_PAGES = 4;
/** Below this many pictures, extra pages cost more to open than they save. */
const PICTURES_PER_PAGE_MIN = 60;

export async function renderOverlay({
  track,
  style,
  width,
  height,
  durationMs,
  dir,
  chromiumPath,
  signal,
  onProgress,
  pages: pageCount = OVERLAY_PAGES,
}: {
  track: Pick<CaptionTrack, "words" | "blocks">;
  style: CaptionStyle;
  /** Output frame size in px. */
  width: number;
  height: number;
  durationMs: number;
  dir: string;
  chromiumPath?: string;
  signal?: AbortSignal;
  /** Fraction of pictures drawn, 0–1. */
  onProgress?: (fraction: number) => void;
  /** Pages drawing in parallel (tests compare 1 with several). */
  pages?: number;
}): Promise<OverlayResult> {
  const frames = captionFrames(track, style, { durationMs });

  // Each distinct picture is drawn once, named in order of first appearance.
  const files = new Map<string, string>();
  const pictures: { file: string; state: OverlayState | null }[] = [];
  for (const frame of frames) {
    const key = overlayStateKey(frame.state);
    if (files.has(key)) continue;
    const file = `overlay-${String(files.size).padStart(6, "0")}.png`;
    files.set(key, file);
    pictures.push({ file, state: frame.state });
  }

  const context = await (await getBrowser(chromiumPath)).newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    const boxCss = captionBoxStyle(style);
    const html = await pageHtml(style, width, height);
    const workers = Math.max(1, Math.min(pageCount, Math.ceil(pictures.length / PICTURES_PER_PAGE_MIN)));
    const pages = await Promise.all(Array.from({ length: workers }, () => openRenderPage(context, html, style)));
    const band = await measureBand(pages[0].page, boxCss, track, style, width, height);

    let drawn = 0;
    const slice = Math.ceil(pictures.length / workers);
    await Promise.all(
      pages.map(async (renderPage, index) => {
        for (const picture of pictures.slice(index * slice, (index + 1) * slice)) {
          signal?.throwIfAborted();
          await showState(renderPage.page, boxCss, wordsFor(track, style, picture.state));
          await renderPage.capture(path.join(dir, picture.file), band);
          onProgress?.(++drawn / pictures.length);
        }
      }),
    );

    const entries = frames.map((frame, index) => ({
      file: files.get(overlayStateKey(frame.state))!,
      durationMs: (frames[index + 1]?.startMs ?? durationMs) - frame.startMs,
    }));
    const listPath = path.join(dir, "overlay.ffconcat");
    await writeFile(listPath, concatList(entries));
    return { listPath, band, frameCount: pictures.length };
  } finally {
    await context.close();
  }
}

/**
 * A page ready to draw: the caption font loaded and a transparent background.
 * Screenshots go straight through the DevTools protocol with `optimizeForSpeed`
 * (faster PNG encoding), the bulk of the time spent on an export's overlay.
 */
async function openRenderPage(context: BrowserContext, html: string, style: CaptionStyle) {
  const page = await context.newPage();
  await page.setContent(html);
  // Never screenshot with a fallback font: wait until the caption face is ready.
  const loaded = await page.evaluate(`document.fonts.load('${CAPTION_FONT_WEIGHTS[style.font]} 40px "Fala Caption"').then((faces) => faces.length)`);
  if (loaded === 0) throw new Error(`Caption font ${style.font} failed to load`);

  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  return {
    page,
    async capture(file: string, band: Band) {
      const { data } = await cdp.send("Page.captureScreenshot", {
        format: "png",
        clip: { ...band, scale: 1 },
        optimizeForSpeed: true,
      });
      await writeFile(file, Buffer.from(data, "base64"));
    },
  };
}

/** FFmpeg concat list. The last picture is listed twice: the demuxer ignores the final entry's duration otherwise. */
export function concatList(entries: { file: string; durationMs: number }[]): string {
  const lines = ["ffconcat version 1.0"];
  for (const entry of entries) lines.push(`file '${entry.file}'`, `duration ${(entry.durationMs / 1000).toFixed(6)}`);
  const last = entries.at(-1);
  if (last) lines.push(`file '${last.file}'`);
  return `${lines.join("\n")}\n`;
}

type WordView = { text: string; css: CssMap };

/** The words of a state with their final CSS: the preview's, with the pop frozen at this instant. */
function wordsFor(track: Pick<CaptionTrack, "words" | "blocks">, style: CaptionStyle, state: OverlayState | null): WordView[] {
  if (!state) return [];
  const block = track.blocks[state.blockIndex];
  const target = activeWordTransform(style);
  return blockWords(track, block).map((word, index) => {
    const css: CssMap = { ...captionWordStyle(style, index, state.activeIndex, FONT_FAMILY), transition: "none" };
    if (target && state.transition) {
      const { previousIndex, eased } = state.transition;
      if (index === state.activeIndex) css.transform = transformCss(interpolateTransform(IDENTITY_TRANSFORM, target, eased));
      else if (index === previousIndex) css.transform = transformCss(interpolateTransform(target, IDENTITY_TRANSFORM, eased));
    }
    return { text: word.text, css };
  });
}

/** The tallest region any block occupies, plus room for the pop, outline and shadow; full width. */
async function measureBand(
  page: Page,
  boxCss: CssMap,
  track: Pick<CaptionTrack, "words" | "blocks">,
  style: CaptionStyle,
  width: number,
  height: number,
): Promise<Band> {
  let top = height;
  let bottom = 0;
  for (const index of track.blocks.keys()) {
    const rect = await showState(page, boxCss, wordsFor(track, style, { blockIndex: index, activeIndex: -1 }));
    if (!rect) continue;
    top = Math.min(top, rect.top);
    bottom = Math.max(bottom, rect.bottom);
  }
  if (bottom <= top) return { x: 0, y: 0, width, height: 2 };
  const margin = Math.ceil((style.size / 360) * width * 0.6);
  const y = Math.max(0, Math.floor(top - margin));
  // Even sizes keep FFmpeg's chroma subsampling happy.
  const bandHeight = Math.min(height - y, Math.ceil(bottom + margin - y));
  return { x: 0, y, width, height: bandHeight - (bandHeight % 2) };
}

/** Replaces the caption block on the page; returns its box, or null when empty. */
function showState(page: Page, boxCss: CssMap, words: WordView[]): Promise<{ top: number; bottom: number } | null> {
  return page.evaluate(([words, boxCss]) => (globalThis as unknown as RenderWindow).showState(words, boxCss), [words, boxCss] as const);
}

type RenderWindow = { showState: (words: WordView[], boxCss: CssMap) => { top: number; bottom: number } | null };

/**
 * The page's side of `showState`, as source text: kept out of the bundler's reach,
 * which would otherwise rewrite it with helpers that don't exist in the page.
 */
const PAGE_SCRIPT = `
window.showState = function (words, boxCss) {
  function apply(element, css) {
    for (const [name, value] of Object.entries(css)) {
      const property = name.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase()).replace(/^webkit-/, "-webkit-");
      element.style.setProperty(property, String(value));
    }
  }
  const frame = document.getElementById("frame");
  frame.replaceChildren();
  if (words.length === 0) return null;
  const box = document.createElement("div");
  apply(box, boxCss);
  for (const word of words) {
    const span = document.createElement("span");
    span.textContent = word.text;
    apply(span, word.css);
    box.append(span);
  }
  frame.append(box);
  const rect = box.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom };
};
`;

async function pageHtml(style: CaptionStyle, width: number, height: number): Promise<string> {
  const font = await readFile(path.join(FONTS_DIR, CAPTION_FONT_FILES[style.font]));
  const weight = style.font === "Schibsted Grotesk" ? "100 900" : String(CAPTION_FONT_WEIGHTS[style.font]);
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
@font-face { font-family: "Fala Caption"; src: url(data:font/woff2;base64,${font.toString("base64")}) format("woff2"); font-weight: ${weight}; font-display: block; }
html, body { margin: 0; background: transparent; }
#frame { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; container-type: inline-size; -webkit-font-smoothing: antialiased; }
</style></head>
<body><div id="frame"></div><script>${PAGE_SCRIPT}</script></body></html>`;
}
