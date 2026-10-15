# Handoff: Fala — video captioning web app (MVP UI)

## Overview
Fala is a web SaaS that turns uploaded short videos into captioned MP4s. Core flow: **sign in → upload → automatic transcription (word-level timestamps) → review captions in a text-based editor → pick/customize a style → export MP4**. There is deliberately **no traditional timeline**; editing happens on text blocks, with a simple playback bar.

This package covers: Sign in / Sign up, Projects (dashboard), Editor (captions + preview + style), Export modal, Plan & usage (billing), Account. Copy is English (a Portuguese version of the prototype exists separately in the project as `Fala PT.dc.html`).

Target stack from the product spec: Next.js + React + TypeScript, Tailwind CSS, Zustand (editor state), Prisma/Neon, Auth.js, Cloudflare R2, Paddle, Resend, worker with FFmpeg on Hetzner.

## About the Design Files
`Fala.dc.html` is a **design reference built in HTML** — a working prototype that shows intended look and behavior. It is **not production code**. Recreate it in the target codebase (Next.js/React/Tailwind) using its established patterns. All data, timers, uploads, payments and renders in the prototype are **simulated**.

To view: open `Fala.dc.html` in a browser (it loads `support.js` from the same folder and Google Fonts). Tweakable props (top of file, `data-props`): `startScreen` (login | dashboard | billing | account | editor), `karaoke` (bool), `errorDemo` (none | render | offline).

## Fidelity
**High-fidelity.** Final colors, typography, spacing, copy and interactions. Recreate pixel-accurately with Tailwind; values below are exact.

---

## Design Tokens

### Colors
| Token | Hex / value | Use |
|---|---|---|
| ink (bg) | `#12110f` | App background, text on light buttons |
| panel-1 | `#1a1916` | Cards, inputs, modals, hover bg |
| panel-2 | `#23211d` | Selected rows/tiles, active nav, hovered icon buttons |
| hover-2 | `#2b2924` | Hover on small buttons inside selected rows |
| line | `rgba(236,230,218,.09)` | Dividers, column borders |
| line-strong | `rgba(236,230,218,.12–.20)` | Button/input borders (.14 inputs, .16–.20 buttons) |
| text | `#ece6da` | Primary text; primary button bg (hover `#ffffff`) |
| muted | `#9a9387` | Secondary text, mono meta labels |
| caption-dim | `#cfc8bb` | Transcript text in non-active blocks |
| accent | `#ff5a1f` | Playhead, active timecode, progress fills, brand dot, destructive-confirm in cards, Render/Pay buttons (hover `#ff7340`) |
| success | `#3ee07a` | "Saved" dot, Ready status glyph |
| warning | `#ffb35c` | "Saving…" dot, near-limit banner, block flags |
| danger | `#ff7a5c` / `#ff9a80` | Errors, offline dot, delete-account button text/border |
| match | `rgba(255,212,0,.2)` bg + `inset 0 0 0 1px rgba(255,212,0,.55)` | Find/replace match highlight; count text `#ffd400` |
| active word (transcript) | bg `rgba(255,90,31,.2)`, `inset 0 -2px 0 #ff5a1f`, text `#fff` | Word currently spoken |
| modal backdrop | `rgba(8,7,6,.62)` + `backdrop-filter: blur(6px)` | All modals |

Caption palette (presets/swatches, NOT UI chrome): highlight `#ffd400, #3ee07a, #ff5a1f, #7ab8ff, #ffffff`; text `#ffffff, #f4efe6, #ffd400, #111111`.

### Typography
- **UI:** `Schibsted Grotesk` (400/500/600/700/800). 
- **Meta / timecodes / labels:** `IBM Plex Mono` (400/500), always `font-variant-numeric: tabular-nums` for times.
- **Caption fonts (render + preview):** `Anton`, `Archivo Black`, `Schibsted Grotesk` (700), `DM Serif Display`. Must be licensed for commercial burn-in (all are OFL).

Scale (px / weight / letter-spacing):
- Page H1: 52 / 700 / -0.045em, line-height 1
- Login H1: 40 / 700 / -0.045em, lh 1.02
- Big numbers: usage 88/700/-0.06em; export % 72/700/-0.05em; plan price 40/700/-0.05em
- Section title: 22–24 / 700 / -0.03em
- Panel title ("Captions", "Style"): 18 / 700 / -0.02em
- Wordmark: "fala" 24 / 800 / -0.05em + "." in accent
- Body: 14–15 / 400–600; transcript text 17 / 400 / lh 1.45
- Small UI: 12–13.5 / 600 (buttons)
- Mono labels: 10.5–12 / 400–500, uppercase labels use letter-spacing .06em

### Radius
4 (word chips), 6–7 (tiny buttons), 8–9 (buttons, inputs, segmented items), 10–11 (inputs on login, preset tiles, primary buttons), 12 (cards/thumbnails, banners), 14 (video frame), 16 (billing cards), 18 (modals), 999 (pills/chips), 50% (avatar, play button).

### Shadows
- Video frame: `0 30px 80px -30px rgba(0,0,0,.8), 0 0 0 1px rgba(236,230,218,.08)`
- Modal: `0 40px 100px -30px rgba(0,0,0,.9)`
- Toast: `0 20px 50px -20px rgba(0,0,0,.8)`
- Thumbnail: `0 0 0 1px rgba(236,230,218,.07)`

### Spacing
4px base. Common: 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 44, 48. Page padding 44px top / 32px sides / 80–96px bottom. Editor header 56px tall.

### Scrollbars
Thin, no arrows: thumb `rgba(236,230,218,.14)` (hover `.30`), 10px wide with 3px transparent border (pill look), transparent track.

---

## Screens / Views

### 1. Sign in / Create account (`screen: login`)
- **Layout:** two flex halves, wrap at narrow widths (`flex: 1 1 440px` form side, `1 1 480px` demo side), each `min-height: 100vh`.
- **Form side:** padding 28/40/32. Wordmark top-left. Centered form `max-width: 380px`, gap 22.
  - H1 "Welcome back" / "Create your account"; subline muted 15px ("Your projects are right where you left them." / "Your first 30 minutes of video each month are on us.").
  - "Continue with Google" button: full width, 13/16 padding, radius 11, bg panel-1, border line .20; hover panel-2.
  - Divider "or with email" (mono 11, lines either side).
  - Fields (label 13/600 above, input 15px, bg panel-1, border .14, radius 10, padding 12/14, focus border `#ece6da`): Name (signup only), Email, Password. "Forgot password" link right of Password label (login only).
  - Error/info line under fields (13px; error color `#ff9a80`).
  - Submit: full width, bg text, ink text, 15/700, radius 11. Label "Sign in" / "Create account" / "Signing in…" (busy → opacity .7).
  - Switch: "New here? **Create account**" / "Already have an account? **Sign in**".
  - Legal footer mono 11 muted, centered: "By continuing you accept the Terms and Privacy Policy. Audio sent for transcription is processed by an external provider."
- **Demo side:** radial bg, left border line. A 9:16 video frame (`width: min(340px, (100vh-200px)*0.5625)`) loops the sample transcript with live captions, cycling through all 5 presets; a 3px accent progress bar at the bottom; preset-name pills under it (active pill: border text color).
- **Validation:** email regex `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$` → "That email doesn't look complete. Check it and try again."; login requires non-empty password ("Enter your password."); signup requires ≥8 chars ("Use at least 8 characters."). Errors clear as the user edits the offending field.
- **Forgot password:** with valid email shows neutral info: "If there's an account for {email}, we sent a sign-in link. It expires in 30 minutes." (never reveals whether the account exists).

### 2. Projects (`screen: dashboard`)
- **Header (shared with Plan & usage, Account):** padding 16/32, bottom border. Wordmark · nav (Projects / Plan & usage / Account — 14/500, active = panel-2 bg + text color) · spacer · usage mini-meter (mono "OCTOBER · 38 of 120 min" + 140×3 bar; bar turns warning at >80%) · plan pill ("Creator") · avatar button (32px, initials; click = sign out).
- **Title row:** H1 "Projects" + mono "6 videos · 38 min captioned this month"; right: muted 14px "Drop a video, review the text, pick a style. We handle the rest."
- **Grid:** `repeat(auto-fill, minmax(190px, 1fr))`, gap 28 row / 20 col.
  - **First tile = drop zone** (9:16, radius 12, 1.5px dashed `rgba(236,230,218,.22)`; hover bg panel-1 and border .4; drag-over border accent + bg `rgba(255,90,31,.08)`, title "Drop it"). 52px cream circle "+", "New video", "Drag a file or click to choose", mono "MP4 · MOV · WEBM / up to 3 min · 1 GB".
  - **Project card:** 9:16 thumbnail (radius 12, dark gradient placeholder for the real thumbnail, bottom vignette) with a **caption sample rendered in that project's preset** over it; duration badge bottom-left (mono 11, bg `rgba(18,17,15,.7)`); delete "×" top-right (28px, opacity .75 → 1). Below: name 14.5/600, status chip (mono 11 pill with glyph) + date mono 11 muted.
  - **Statuses (glyph + label — never color alone):** ● Ready (green), ✓ Exported, ◐ Rendering N% (accent, plus 3px progress bar at thumbnail bottom), ↑ Uploading, ◌ Validating, ◌ Transcribing, ▲ Error.
  - **Processing overlay** (upload/validate/transcribe): blurred dark overlay with big % (30/700), 3-step list (File upload / Validation / Transcription — dot filled text color when done, accent when active, hollow when pending), 3px accent bar. Overall % = upload 0–40, validate 40–50, transcribe 50–100. Card is clickable → opens editor in processing state.
  - **Error overlay:** ▲, "We couldn't find speech in this file", "The audio seems silent. Upload another version — nothing was deducted from your usage.", button "Upload another file".
  - **Delete confirm (in-card overlay):** "Delete this project?" / "The video, captions and exports will be deleted." / [Keep] [Delete (accent bg)].

### 3. Editor (`screen: editor`)
**Header (56px):** ← Projects · divider · inline-editable project name (borderless input, hover/focus border, focus bg panel-1; width up to 320) · save indicator (6px dot + mono 11.5: green "Saved", warning "Saving…", danger "Offline · kept in this browser" + "Retry now" button) · Undo / Redo icon buttons (32px; disabled = 25% opacity) · spacer · keyboard hints (≥1100px only: `space` play, `← →` blocks) · [Style] toggle (720–1099px only) · **Export** button (cream; label becomes "Rendering N%" / "Render failed" (danger bg); disabled grey while transcription is running, with tooltip "Available once transcription finishes").

**Body — 3 columns at ≥1100px:**
1. **Captions column** (`flex: 1 1 0; min-width: 270px`, right border):
   - Header: "Captions" + mono "18 blocks"; right: "EN" (≥1100) + **Replace** button (opens find/replace; Ctrl/Cmd+F).
   - **Find & replace bar** (panel-1 card, radius 12): inputs "Wrong word" / "Replace with" (grid `repeat(auto-fit, minmax(150px,1fr))`), count line (mono 11.5; `#ffd400` when matches: "3 matches in 2 blocks"; otherwise "Type the word the transcript got wrong" / "Search one word at a time" / "No matches"), checkbox "Save to dictionary", button "Replace" / "Replace all" (disabled until matches + replacement). Enter = replace, Esc = close. Dictionary chips listed below ("~~wrong~~ → right ×") under label "DICTIONARY · APPLIED TO FUTURE VIDEOS".
   - **Block list** (scrollable, gap 4): each block row padding 12/14/14, radius 10. Shows mono timecode "00:03.2 → 00:05.1" (accent when it's the active block) + optional flag (◆ warning: "fast read" when >21 chars/sec, "estimated timing — check it" after a text edit changed word count). Words are individual clickable spans (click = seek to that word + select block). Active block = karaoke: spoken words text color, upcoming words muted, current word highlighted (see tokens). Non-active blocks `#cfc8bb`.
   - **Selected block** (bg panel-2, border .16): thin split handles appear between words (12×22 hit area, 2×16 line; hover accent; click = split at that gap). Action row: [Edit text] [Merge with next] … "start − +" "end − +" (24px mono buttons, ±100ms).
   - **Edit text:** textarea (17px, bg ink, border .25) + [Apply] [Cancel], hint "enter applies · esc cancels".
   - Hint at bottom when nothing selected: "Tip: select a block and click between two words to split it."
   - **Processing state:** card with title ("Uploading the video" / "Validating the file" / "Transcribing the audio"), %, bar, 3 steps (File upload / Validation / Transcription and word timestamps), note "You can pick a style meanwhile — it's applied as soon as the captions arrive. If you leave, processing continues." + skeleton lines.
2. **Preview column** (`flex: 1.15 1 0; min-width: 320px`, radial bg, centered, wrapper max-width 440):
   - Video frame: aspect = real video aspect (default 9:16), `width: min(100%, (100vh - 210px) * aspect)`, radius 14. Top row: mono label left ("SAMPLE · 1080×1920" / "YOUR VIDEO · W×H", ellipsizes) and **"Use my video" / "Replace video"** chip right (file picker). Drag a video onto the frame → orange dashed overlay "Drop to use this video". Click frame = play/pause. Big play glyph overlay when paused at 0.
   - Caption overlay (see Caption rendering).
   - Playback bar (not an edit timeline): 4px track, cream fill, small tick per block start (accent for active), 12px accent knob with ink ring; click to seek.
   - Controls row (3-col grid): time "00:05.7 / 00:22.7" (mono 12) · prev block (34px) · **play/pause** (46px cream circle) · next block · speed button cycling 1× → 1.25× → 1.5× → 0.75×.
3. **Style panel** (`310px`, left border, scrollable, padding 20, gap 24):
   - "Style" + "Restore default" link (only when modified).
   - **Preset grid** 2 cols: tile = 16:10 dark preview showing "IT'S THE RHYTHM" in that preset (3rd word active) + name; selected = panel-2 bg + 1.5px text-color border; "edited" mono tag when modified.
   - "ADJUSTMENTS · {preset}" then: Font (2×2 chips, each in its own face) · Size (range 14–54) · Spoken word highlight (segmented: Box / Color / Reading / None; swatches shown for Box/Color) · Text color (swatches 28px, selected ring `0 0 0 2px panel-1, 0 0 0 4px text`) · toggles 2×2 (All caps / Outline / Shadow / Bar) · Outline thickness (range 1–6, step .5, only if Outline) · Position (Top / Middle / Bottom) · Word entrance (Instant / Soft pop) · Words per block stepper (1–10; **re-segments blocks**).
   - Segmented control: container panel-1 radius 9 padding 3; item 12.5/600, active = cream bg + ink text.

**Responsive:**
- **720–1099px:** captions + preview only. Style panel becomes a **right drawer** (`position: fixed; top: 56px; width: min(340px, 92vw)`; `transform translateX(105%) → 0`, `.28s cubic-bezier(.2,.8,.2,1)`), opened by header "Style" button, backdrop `rgba(8,7,6,.5)`, close via × or backdrop.
- **<720px:** single column: preview on top (frame height ≈ 40vh), then tabs **Captions | Style** (min 44px tall), active tab content fills the rest and scrolls. Header drops "Projects" label and save text (dot only).

**Toast:** fixed, top 68px, centered; cream bg, ink text 13.5/600, radius 12; e.g. "Undone: split block" with [Redo] or "3 words replaced · timing kept" with [Undo]. Auto-hides after 3.2s.

**Leave-with-unsynced-changes dialog** (only when offline): "Some changes haven't synced yet" / explanation / [Leave anyway] [Stay in editor].

### 4. Export modal
Sheet `min(460px,100%)`, panel-1, radius 18, padding 26, gap 20.
- **Config:** "Export video" / "MP4 with captions burned into the image." · resolution cards (720p "Faster · smaller" / 1080p "Original quality"; selected = panel-2 + 1.5px text border) · mono summary box (preset · blocks · duration; "We freeze this version. You can keep editing while it renders.") · [Cancel] [**Render** (accent)].
- **Rendering:** mono "RENDERING · 1080p", huge % (72px), 4px accent bar, "You can close this window or the tab. We'll email you when it's done." [Keep editing]. The header Export button mirrors progress.
- **Failed:** ▲, "The render stopped at 64%", "It was a failure on our server, not in your project. The reserved minutes were returned to your balance and your captions are intact.", mono error code "RENDER_TIMEOUT · ref 8F2K-41", [Close] [Try again].
- **Done:** "Done." (40px, accent period), mono file line `{slug}_v{n}.mp4 · 1080×1920 · 23.8 MB`, [Download MP4] [New version].
- Always: "PREVIOUS VERSIONS" list (v#, resolution · size · date, Download link). New exports never overwrite older versions.

### 5. Plan & usage (`screen: billing`)
Max-width 1120. H1 + mono period label.
- **Near-limit banner** (>80% used, or downgrade scheduled): warning border/bg, ◆, explanatory text.
- **Usage card** (panel-1, radius 16): "MINUTES THIS MONTH", huge "38" + "of 120 min", 8px meter with used (cream) + reserved (accent diagonal stripes `repeating-linear-gradient(45deg, #ff5a1f 0 2px, transparent 2px 4px)`) + legend + "renews Nov 1".
- **Your plan card:** plan name 36px, status (mono), facts rows (Minutes per month / Length per video / Resolution / Simultaneous exports), [Payment & invoices] (→ Paddle portal).
- **Plans grid** (`auto-fit minmax(250px,1fr)`): Free $0 / Creator $9 / Pro $24 per month (**placeholder prices — spec leaves pricing open**). Current = text-color border + "YOUR PLAN" pill; CTA "Switch to X" (cream) for upgrades, "Move to X" (outline) for downgrades, dashed "Current plan"/"Scheduled".
- **Change-plan modal:** review (summary lines; upgrade shows prorated amount; downgrade explains it takes effect at period end) → **waiting** ("Payment sent. Waiting for confirmation from Paddle…" — plan only changes after webhook confirmation) → done ("You're on Pro." / "Scheduled.").
- **Recent activity (usage ledger):** rows with project, kind · date, status pill (◐ reserved accent / ✓ confirmed / ↺ released muted) and quantity (released = struck through, not charged).

### 6. Account (`screen: account`)
Max-width 680, three sections separated by line dividers:
- **Profile:** avatar initials (64px), name, "connected with Google"; Name + Email inputs; "Save changes" enabled only when dirty; email change shows "We'll send a confirmation link to the new address. Until you click it, your current email stays active."; after save, "Changes saved" (green dot).
- **Preferences:** Password row ("You sign in with Google. You can also create a password…" → [Create password] → "Link sent to {email}. It expires in 30 minutes." / [Resend link]); one switch "Email me when an export finishes" (34×20 track).
- **Delete account:** text + outlined danger button → dialog listing what is removed (projects, exports, subscription canceled, stored files removed within 7 days), requires typing the account email to enable "Delete forever" → returns to sign-in with info "Account deleted. Your files will be removed within 7 days. Thanks for using Fala."

---

## Caption rendering (shared preview ⇄ export contract)
Preview and FFmpeg render must consume the **same style config**. All sizes are authored against a **360px-wide frame** and scale with frame width (prototype uses `cqw`: `value/360*100 cqw`). Renderer should use `value/360 * outputWidth` px.

Style config (`ProjectStyle.configuration`):
```ts
{ font: 'Anton'|'Archivo Black'|'Schibsted Grotesk'|'DM Serif Display',
  size: number,            // px @360w
  upper: boolean,          // uppercase
  color: string,           // text hex
  hl: string,              // highlight hex
  mode: 'box'|'text'|'dim'|'none',
  outline: boolean, ow: number,   // stroke px @360w, black, paint-order stroke fill
  shadow: boolean,         // 0 2px 10px rgba(0,0,0,.6) @360w
  plate: boolean,          // black bar behind words rgba(10,10,10,.82)
  pos: 'top'|'mid'|'bottom',      // top 13% / centered / bottom 14%
  anim: 'none'|'pop',
  maxW: number }           // max words per block (segmentation)
```
Container: left/right 7%, flex-wrap centered, column gap `size*.22`, line-height 1.08. Word padding `size*.03 / size*.1`, radius `size*.14`.
Active word: **box** → bg `hl`, text auto-contrast (`#111` if luminance > .55 else `#fff`), no stroke/shadow, pop = `scale(1.1) rotate(-2deg)`; **text** → color `hl`, pop = `scale(1.12)`; **dim** → words after the active one at opacity .5; pop on none/dim = `scale(1.06)`. Transition `transform 120ms cubic-bezier(.3,1.7,.5,1)`.

Presets (defaults):
| key | name | font | size | upper | mode | hl | outline | shadow | pos | anim | maxW | plate |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bold | Bold Highlight | Anton | 38 | ✓ | box | #ffd400 | 3 | ✓ | mid | pop | 3 | – |
| word | Word Highlight | Archivo Black | 27 | – | text | #3ee07a | 2.5 | ✓ | bottom | pop | 4 | – |
| podcast | Clean Podcast | Schibsted Grotesk 700 | 23 | – | dim | – | – | ✓ | bottom | none | 6 | – |
| classic | Classic | Schibsted Grotesk 700 | 19 | – | none | – | – | – | bottom | none | 7 | ✓ |
| minimal | Minimal | DM Serif Display | 26 | – | none | – | – | ✓ | bottom | none | 5 | – (color #f4efe6) |

Active word = last word in the active block whose `startMs <= currentTime` (prevents flicker in gaps). Active block = `startMs <= t < endMs`. **Time always derives from the `<video>` clock**, never an independent timer.

## Interactions & Behavior (summary)
- **Keyboard (editor, ignored while typing in inputs):** Space play/pause · ←/→ previous/next block · Esc close modal / deselect · Ctrl/Cmd+Z undo · Ctrl/Cmd+Shift+Z or Ctrl+Y redo · Ctrl/Cmd+F open replace.
- **Segmentation (pure fn, unit-tested):** break after `.!?:`, after `,` if block ≥2 words, on pause >300ms, or at `maxW`. Block end = min(lastWord.end + 220ms, nextBlock.start).
- **Split:** at gap i → block A ends at min(word[i].end+120, word[i+1].start); B starts at word[i+1].start. **Merge:** union. **Nudge:** ±100ms, clamped to prev.end / next.start, min duration 300ms.
- **Text edit:** same word count → replace texts, keep timestamps. Different count → redistribute across original span proportional to length and flag "estimated timing".
- **Replace all:** accent- and case-insensitive whole-word match on the word core (punctuation stripped); preserves surrounding punctuation and the original's leading capital; timestamps untouched.
- **Undo/redo:** snapshots of {words, blocks, style, presetKey}, max 60; consecutive slider/nudge changes on the same control within 700ms coalesce into one step. Labels: split block, merge blocks, timing change, text edit, preset change, style change, words per block, restore preset, replace.
- **Autosave:** debounce ~900ms → "Saving…" → "Saved". Offline → "Offline · kept in this browser" + Retry; leaving prompts the unsynced dialog.
- **Upload:** create project → presigned R2 URL → direct browser upload → server/worker validation. Card states walk Uploading → Validating → Transcribing → Ready. Never mark Ready from the browser's word alone.
- **Export:** snapshot config at job creation; edits during render don't affect it; "Render failed" releases reserved usage.
- **Billing:** plan changes only after Paddle webhook confirmation; downgrades scheduled at period end; usage reserved → confirmed/released.

## State Management (suggested Zustand slices)
- `editor`: `words[] {t,s,e}` (ms ints), `blocks[] {id,a,b,s,e,realign?}` (word index range + ms), `style`, `presetKey`, `t`, `playing`, `rate`, `selId`, `editingId`, `draft`, `save: saved|saving|offline`, `undo[]`, `redo[]`, `find {open,q,r,remember}`, `dict[]`, `video {url,aspect,dims}`, `ui {drawer, mobTab, toast}`.
- `export`: `stage: cfg|rendering|failed|done`, `res`, `pct`, `versions[]` (poll job status).
- `projects`: list with `status`, `pct`, `preset`, `thumbnail`, `duration`; poll/stream status for processing items.
- `billing`: `plan`, `usedMin`, `reservedMin`, `limit`, `ledger[]`, `pendingChange`.
- `account`: `name`, `email`, `pendingEmail`, `notif.exportDone`.

## Assets
- No images/icons from external libraries. Icons are tiny inline SVGs (play, pause, prev, next, undo, redo) — replace with the codebase's icon set (e.g. Lucide) at the same sizes (14–16px, 1.6 stroke for undo/redo).
- Video thumbnails/frames in the prototype are **CSS gradient placeholders** — use real R2 thumbnails / the `<video>` element.
- Fonts: Google Fonts — Schibsted Grotesk, IBM Plex Mono, Anton, Archivo Black, DM Serif Display. Self-host for production and bundle the caption fonts in the render worker.

## Screenshots
Captured at a ~924px-wide viewport (so the editor shows the mid-width layout with the Style drawer). Folder `screenshots/`:
- `01-sign-in.png`
- `02-projects.png`
- `03-plan-and-usage.png`
- `04-account.png`
- `05-editor-playback.png`
- `06-editor-block-selected.png`
- `07-editor-find-replace.png`
- `08-editor-style-drawer.png`
- `09-export-modal.png`

## Files
- `Fala.dc.html` — complete prototype (all screens; template + logic class in one file).
- `support.js` — runtime needed only to open the prototype in a browser. Not part of the implementation.
