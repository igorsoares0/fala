# Supertitle pSEO: implementation spec (wave 1)

You are implementing the first wave of programmatic SEO pages for Supertitle (usesupertitle.com). Read this whole file before writing code. Work in the two phases below, in order, and stop for review at the end of each.

## 1. Product facts

Use only these facts in page copy. If a page needs a fact that is not here and not in the codebase, do not invent it: mark it as pending (section 6).

- Supertitle adds burned-in captions to short videos. Flow: upload a video, review the auto-generated text, pick a style, export an MP4.
- Transcription is automatic and word-by-word, in the language spoken in the video. Dozens of languages are detected automatically.
- The editor is document-style: fix words, split or merge captions, adjust timing. There is no timeline.
- Five style presets, each adjustable: Bold Highlight, Word Highlight, Clean Podcast, Classic, Minimal.
- Caption position: top, middle or bottom of the frame.
- Trim: cut the start and the end of a video before export (no cuts in the middle). Non-destructive: the original upload, the transcript and the captions are kept.
- Formats: export as uploaded ("Original") or cropped to 9:16 (TikTok, Reels, Shorts, Stories), 4:5 (Instagram and Facebook feed), 1:1 (feeds, LinkedIn, X) or 16:9 (YouTube, LinkedIn, X). The crop always fills the frame, with no black bars, and the framing can be slid along the axis being cut. Non-destructive, like the trim.
- Safe zones: in a full-screen vertical frame, the editor can show where TikTok, Reels and Shorts draw their own interface over the video (a toggle, off by default), and the bottom caption position sits above that area. The zones are a cautious approximation, not official platform numbers: never present them as exact or platform-published.
- Input: MP4, MOV, WEBM, up to 30 minutes. Output: MP4.
- Plans (USD): Free is $0 with 10 minutes of video per month, videos up to 3 minutes, 720p. Creator is $12/month or $108/year with 120 minutes, videos up to 10 minutes, 1080p. Pro is $29/month or $288/year with 400 minutes, videos up to 30 minutes, 1080p.
- No plan adds a watermark, including Free.

Before using the plan numbers, check them against the pricing source in the codebase. If they differ, the codebase wins; tell me about the difference.

What Supertitle does **not** do. Never claim or imply any of these:

- Translation of captions into another language
- Cutting long videos into clips, removing parts from the middle of a video, B-roll, silence removal, AI avatars, dubbing (trimming only the start and the end is supported)
- Export of SRT or VTT files, unless you find that feature in the codebase
- A mobile app

## 2. Ground rules

- Discover the stack, routing, styling and component conventions by reading the repository. Follow what is there. Do not add a CMS, a database table or a new UI library for this work.
- All pages are in English and statically rendered at build time.
- Reuse the existing landing page's header, footer, buttons and typography. New pages must look like part of the same site.
- Every page's primary call to action goes to the existing sign-up flow.
- Do not change the existing home page, app routes, auth or billing code, except to add footer links to the four hubs.
- No page may be a near-copy of another with the keyword swapped. Each page's unique fields (section 5) are required content, not optional extras.

## 3. Phase 1: infrastructure

Build this first, with one example page per template, then stop for review.

### 3.1 Content layer

- One structured content file per page (JSON, MDX or typed TS objects, whichever fits the repo), grouped by page type.
- A typed schema per page type. Shared fields: `slug`, `title` (title tag), `metaDescription`, `h1`, `primaryKeyword`, `intro`, `faq` (3 to 5 question/answer pairs), `related` (slugs of 3 to 4 other pages), `status` (`draft` or `published`).
- Type-specific required fields are listed in section 5.
- Validate every content file at build time. A missing or empty required field fails the build with the file and field named. Pages with `status: draft` or with any pending marker (section 6) are built without being indexed: `noindex` and left out of the sitemap.

### 3.2 Templates

One template per page type: hub, alternative, feature, platform, tool. Each renders the shared fields plus its own sections from section 5.

### 3.3 SEO plumbing

- Unique `<title>` (60 characters or fewer) and meta description (155 characters or fewer) per page, from the content file.
- Self-referencing canonical URL on every page.
- Open Graph and Twitter card tags.
- JSON-LD: `SoftwareApplication` on feature, platform and alternative pages; `FAQPage` wherever the FAQ is rendered; `BreadcrumbList` on every non-hub page.
- XML sitemap that includes the new published pages. If the site has no sitemap yet, create one that also covers the existing public pages. Reference it in `robots.txt`.
- No trailing-slash duplicates and no uppercase URLs.

### 3.4 Internal linking

- Each hub lists all published pages of its type.
- Each child page shows breadcrumbs back to its hub and a "Related" block from its `related` field.
- Add the four hubs to the site footer.

### 3.5 Performance

- No client-side JavaScript on content pages beyond what the existing layout already ships. The two tool pages are the exception.
- Images and video previews are lazy-loaded with explicit dimensions.

## 4. Phase 2: wave 1 pages

Create exactly these 16 pages. Do not add others. URLs, keywords and title tags are final; write the meta description, H1 and body yourself.

| Type | URL | Primary keyword | Title tag |
| --- | --- | --- | --- |
| Hub | `/alternatives` | caption tool alternatives | Supertitle Alternatives & Comparisons |
| Hub | `/captions-for` | captions for social video | Captions for TikTok, Reels, Shorts & More |
| Hub | `/styles` | caption styles | Caption Styles for Short Videos |
| Hub | `/tools` | free subtitle tools | Free Subtitle & Caption Tools |
| Alternative | `/alternatives/submagic` | submagic alternative | Submagic Alternative Without Per-Video Caps |
| Alternative | `/alternatives/captions-ai` | captions ai alternative | Captions.ai Alternative That Works in the Browser |
| Alternative | `/alternatives/capcut` | capcut alternative for captions | CapCut Alternative for Auto Captions (No Timeline) |
| Alternative | `/alternatives/veed` | veed alternative | VEED Alternative for Fast Burned-In Captions |
| Feature | `/caption-generator-no-watermark` | caption generator no watermark | Free Caption Generator With No Watermark |
| Feature | `/burn-in-subtitles` | burn subtitles into video | Burn Subtitles Into Video Online (MP4) |
| Platform | `/captions-for/tiktok` | add captions to tiktok video | Add Captions to TikTok Videos |
| Platform | `/captions-for/instagram-reels` | add captions to reels | Add Captions to Instagram Reels Automatically |
| Platform | `/captions-for/youtube-shorts` | add captions to youtube shorts | Add Captions to YouTube Shorts (Burned-In) |
| Platform | `/captions-for/linkedin-video` | add captions to linkedin video | Add Captions to LinkedIn Videos |
| Tool | `/tools/srt-to-vtt` | srt to vtt | SRT to VTT Converter (Free, In Your Browser) |
| Tool | `/tools/vtt-to-srt` | vtt to srt | VTT to SRT Converter (Free, In Your Browser) |

The `/styles` hub ships in wave 1 as a gallery of the five presets with no child pages yet. The child style pages come in a later wave.

Wording rule: on these pages "captions" always means on-video text. Never write copy that could be read as generating post descriptions or hashtags.

## 5. Required unique content per page type

### Alternative pages

- `verdict`: two or three sentences on who should pick Supertitle and who should stay with the competitor.
- `comparisonTable`: rows for starting paid price, free tier limits, watermark on free exports, how limits are counted (minutes or videos), platform (browser or app), editing model (text document or timeline). **All competitor values are pending** (section 6); fill only the Supertitle column.
- `whereTheyWin`: at least two real advantages of the competitor. These pages must be fair. Starting points:
  - Submagic: B-roll and clipping features. Supertitle's angle: limits counted in minutes instead of a number of videos, and no watermark on the free plan.
  - Captions.ai: mobile app and AI extras. Supertitle's angle: works in the browser, text-document editor.
  - CapCut: full video editor. Supertitle's angle: no timeline to learn, browser only, captions edited as text.
  - VEED: full online editor. Supertitle's angle: single-purpose and fast, free export without watermark.
- `switchingSteps`: three short steps to caption a first video in Supertitle.

Do not use competitor logos or screenshots. Refer to competitors by name in plain text only.

### Platform pages

- `specs`: aspect ratio, maximum video length, recommended resolution for that platform. **Pending** until I confirm the numbers.
- `safeZone`: where on-screen UI covers the video and where captions should sit, explained through Supertitle's own safe-zone feature (section 1): in a full-screen vertical frame the editor can show the covered areas, and the bottom caption position sits above them. Keep the description general (the app's interface covers the top, the bottom and the right edge): no percentages or pixel values, and never call the zones official or exact. The feature is built for TikTok, Reels and Shorts, so the LinkedIn page explains caption placement without claiming the zones match LinkedIn's interface. For the visual, render a placeholder component with a pending marker; I will supply a screenshot of the editor with safe zones turned on.
- `nativeComparison`: how the platform's built-in captions differ from burned-in captions (styling control, visibility with sound off, portability to other platforms). Keep claims general unless verified.
- `recommendedPreset`: one of the five presets, with one sentence on why. LinkedIn uses Minimal or Classic.
- `presetPreview`: a slot for a preview video of that preset. **Pending** asset.

### Feature pages

- `/caption-generator-no-watermark`: the exact Free plan limits, a slot for a sample export (pending asset), and a table of competitors' free-tier watermark policies (competitor cells pending).
- `/burn-in-subtitles`: open versus closed captions explained in plain language, a before/after frame slot (pending asset), and why social platforms favor burned-in text.

### Tool pages

- A working converter that runs entirely in the browser. The file is never uploaded to a server.
- Accepts a dropped or selected file and pasted text. Outputs a downloadable file and a copy button.
- SRT to VTT: add the `WEBVTT` header, convert `,` to `.` in timestamps, keep cue text and line breaks, drop numeric cue indices.
- VTT to SRT: strip the header, `NOTE` blocks, `STYLE` blocks and cue settings, convert `.` to `,`, add missing hour fields, number the cues from 1.
- Handle a UTF-8 BOM, CRLF line endings, multi-line cues and empty input. Show a clear error for invalid files instead of producing a broken file.
- Unit tests for both directions, covering each case above plus a round trip.
- Below the tool: a short explanation of the two formats, a FAQ, and a call to action for people who need the captions burned into the video.
- No sign-up wall.

### Hub pages

- A short intro (two or three sentences) and a card for each published child page with a one-line description taken from the child's content file.

## 6. Pending markers

Whenever a value needs my input (competitor data, platform specs, preview assets, anything not in section 1 or the codebase), do not guess. Put `TODO(igor): <what is needed>` in the content file's field.

- Any page containing a pending marker is built as `noindex` and excluded from the sitemap.
- Add a script (for example `pseo:pending`) that lists every pending marker by page, so I can work through them.

## 7. Acceptance criteria

Phase 1 is done when:

- The build passes, and deleting a required field from a content file makes it fail with a clear message.
- One example page per template renders with correct title, meta description, canonical, Open Graph tags and valid JSON-LD.
- The sitemap and `robots.txt` are correct, and a page with a pending marker is absent from the sitemap and carries `noindex`.

Phase 2 is done when:

- All 16 URLs return 200 and match the table in section 4 exactly.
- Both converters pass their tests and work with a real file in the browser.
- No two pages share the same title, meta description, H1 or intro paragraph.
- Every page links to its hub and to at least three related pages, and every hub links to all of its children.
- The pending script prints the full list of what I need to supply.
- Existing tests, lint and type checks pass.

At the end of each phase, give me a summary of the files created, anything you chose differently from this spec and why, and the pending list.

## 8. Out of scope

- Any page not in the section 4 table: style child pages, language pages, comparison pages, more tools.
- Localized versions and `hreflang`.
- A blog.
- Changes to pricing, product features or the app itself.
