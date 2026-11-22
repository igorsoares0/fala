import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/** The wave 1 pages (docs/PSEO_PLAN.md, section 4) with their final title tags. */
const PAGES: [path: string, title: string][] = [
  ["/alternatives", "Supertitle Alternatives & Comparisons"],
  ["/captions-for", "Captions for TikTok, Reels, Shorts & More"],
  ["/styles", "Caption Styles for Short Videos"],
  ["/tools", "Free Subtitle & Caption Tools"],
  ["/alternatives/submagic", "Submagic Alternative Without Per-Video Caps"],
  ["/alternatives/captions-ai", "Captions.ai Alternative That Works in the Browser"],
  ["/alternatives/capcut", "CapCut Alternative for Auto Captions (No Timeline)"],
  ["/alternatives/veed", "VEED Alternative for Fast Burned-In Captions"],
  ["/caption-generator-no-watermark", "Free Caption Generator With No Watermark"],
  ["/burn-in-subtitles", "Burn Subtitles Into Video Online (MP4)"],
  ["/captions-for/tiktok", "Add Captions to TikTok Videos"],
  ["/captions-for/instagram-reels", "Add Captions to Instagram Reels Automatically"],
  ["/captions-for/youtube-shorts", "Add Captions to YouTube Shorts (Burned-In)"],
  ["/captions-for/linkedin-video", "Add Captions to LinkedIn Videos"],
  ["/tools/srt-to-vtt", "SRT to VTT Converter (Free, In Your Browser)"],
  ["/tools/vtt-to-srt", "VTT to SRT Converter (Free, In Your Browser)"],
];

test("every pSEO page is public, with its title, canonical, structured data and sign-up link", async ({ page }) => {
  for (const [path, title] of PAGES) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page).toHaveTitle(title);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.locator('script[type="application/ld+json"]').count(), path).toBe(1);
    await expect(page.getByRole("link", { name: "Start free" }).first()).toHaveAttribute("href", "/sign-in");
  }
});

test("unknown pSEO URLs are 404s and uppercase URLs redirect to lowercase", async ({ page, request }) => {
  expect((await request.get("/alternatives/not-a-tool")).status()).toBe(404);
  expect((await request.get("/tools/srt-to-vtt/extra")).status()).toBe(404);
  await page.goto("/Captions-For/TikTok");
  await expect(page).toHaveURL(/\/captions-for\/tiktok$/);
});

test("hubs link to their children, and the footer links to the hubs", async ({ page }) => {
  await page.goto("/alternatives");
  for (const name of ["Submagic", "Captions.ai", "CapCut", "VEED"]) {
    await expect(page.getByRole("region", { name: "Alternatives" }).getByRole("link", { name: new RegExp(name) })).toBeVisible();
  }
  const footer = page.getByRole("contentinfo");
  for (const name of ["Alternatives", "Captions by platform", "Caption styles", "Free tools"]) {
    await expect(footer.getByRole("link", { name })).toBeVisible();
  }
  await footer.getByRole("link", { name: "Caption styles" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Bold Highlight" })).toBeVisible();
});

test("the SRT to VTT and VTT to SRT tools convert a real file in the browser", async ({ page }, testInfo) => {
  const srtPath = testInfo.outputPath("sample.srt");
  const srt = "﻿1\r\n00:00:01,000 --> 00:00:02,500\r\nHello there.\r\n\r\n2\r\n00:00:03,000 --> 00:00:05,250\r\nTwo lines\r\nin one cue.\r\n";
  writeFileSync(srtPath, srt);

  // Nothing is sent while converting (Next's link prefetches are plain GETs without a body).
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" || request.postData()) requests.push(`${request.method()} ${request.url()}`);
  });

  await page.goto("/tools/srt-to-vtt");
  requests.length = 0;
  await page.locator('input[type="file"]').setInputFiles(srtPath);
  await expect(page.getByLabel("VTT result")).toHaveValue(/^WEBVTT\n\n00:00:01\.000 --> 00:00:02\.500\nHello there\./);
  const [vttDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download .vtt" }).click()]);
  expect(vttDownload.suggestedFilename()).toBe("sample.vtt");
  const vttPath = testInfo.outputPath("sample.vtt");
  await vttDownload.saveAs(vttPath);
  expect(requests).toEqual([]);

  await page.goto("/tools/vtt-to-srt");
  await page.locator('input[type="file"]').setInputFiles(vttPath);
  await expect(page.getByLabel("SRT result")).toHaveValue("1\n00:00:01,000 --> 00:00:02,500\nHello there.\n\n2\n00:00:03,000 --> 00:00:05,250\nTwo lines\nin one cue.\n");
  const [srtDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download .srt" }).click()]);
  expect(srtDownload.suggestedFilename()).toBe("sample.srt");
  expect(readFileSync(await srtDownload.path(), "utf8")).toContain("00:00:03,000 --> 00:00:05,250");

  // An invalid file gets a clear error instead of a broken result.
  await page.getByLabel("Or paste the VTT text").fill("not a subtitle file");
  await page.getByRole("button", { name: "Convert to SRT" }).click();
  await expect(page.locator("p[role=alert]")).toContainText('the first line should be "WEBVTT"');
  await expect(page.getByLabel("SRT result")).toHaveValue("");
});
