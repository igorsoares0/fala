import { CAPTION_FONT_WEIGHTS, CAPTION_REFERENCE_WIDTH, contrastTextColor, type CaptionStyle } from "./style";

/**
 * The caption overlay's CSS, shared by the editor preview (React) and the export
 * renderer (headless Chromium), so both draw captions with exactly the same rules
 * (handoff "Caption rendering"). Sizes are in `cqw`: the overlay's container must
 * have `container-type: inline-size` and span the video's width.
 *
 * Property names are camelCase, as React's `style` prop expects.
 */
export type CssMap = Record<string, string | number>;

/** Scales a px value authored at the 360px reference width to the container width. */
const u = (value: number) => `${((value / CAPTION_REFERENCE_WIDTH) * 100).toFixed(3)}cqw`;

/** A word's transform: `scale(s) rotate(r deg)`. The identity is `{ scale: 1, rotate: 0 }`. */
export type WordTransform = { scale: number; rotate: number };

export const IDENTITY_TRANSFORM: WordTransform = { scale: 1, rotate: 0 };

/** Duration and curve of the "soft pop" when a word becomes active (or stops being active). */
export const POP_TRANSITION_MS = 120;
export const POP_EASING = [0.3, 1.7, 0.5, 1] as const;

/** Where the spoken word ends up when the style pops it, or null when it doesn't move. */
export function activeWordTransform(style: CaptionStyle): WordTransform | null {
  if (style.anim !== "pop") return null;
  if (style.mode === "box") return { scale: 1.1, rotate: -2 };
  if (style.mode === "text") return { scale: 1.12, rotate: 0 };
  return { scale: 1.06, rotate: 0 };
}

export function transformCss(transform: WordTransform): string {
  if (transform.scale === 1 && transform.rotate === 0) return "none";
  const scale = `scale(${round(transform.scale)})`;
  return transform.rotate === 0 ? scale : `${scale} rotate(${round(transform.rotate)}deg)`;
}

const round = (value: number) => Math.round(value * 10_000) / 10_000;

/** The block's container: centered words, wrapped, at the style's position. */
export function captionBoxStyle(style: CaptionStyle): CssMap {
  const box: CssMap = {
    position: "absolute",
    left: "7%",
    right: "7%",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    columnGap: style.plate ? 0 : u(style.size * 0.22),
    rowGap: style.plate ? 0 : u(style.size * 0.04),
    lineHeight: 1.08,
    textAlign: "center",
    pointerEvents: "none",
  };
  if (style.pos === "top") box.top = "13%";
  else if (style.pos === "mid") {
    box.top = "50%";
    box.transform = "translateY(-50%)";
  } else box.bottom = "14%";
  return box;
}

/**
 * One word of the block. `activeIndex` is the spoken word (-1 for none);
 * `fontFamily` is the CSS font-family of `style.font` in the host page.
 */
export function captionWordStyle(style: CaptionStyle, index: number, activeIndex: number, fontFamily: string): CssMap {
  const s: CssMap = {
    fontFamily,
    fontWeight: CAPTION_FONT_WEIGHTS[style.font],
    fontSize: u(style.size),
    color: style.color,
    textTransform: style.upper ? "uppercase" : "none",
    letterSpacing: style.upper ? "0.01em" : "0",
    display: "inline-block",
    padding: `${u(style.size * 0.03)} ${u(style.size * 0.1)}`,
    borderRadius: u(style.size * 0.14),
    WebkitTextStroke: style.outline ? `${u(style.ow)} #000` : "0",
    paintOrder: "stroke fill",
    textShadow: style.shadow ? `0 ${u(2)} ${u(10)} rgba(0,0,0,.6)` : "none",
    // "Soft pop": the active word springs in; instant styles simply have no transform to animate.
    transition: `transform ${POP_TRANSITION_MS}ms cubic-bezier(${POP_EASING.join(",")})`,
  };

  if (index === activeIndex) {
    if (style.mode === "box") {
      s.background = style.hl;
      s.color = contrastTextColor(style.hl);
      s.WebkitTextStroke = "0";
      s.textShadow = "none";
    } else if (style.mode === "text") {
      s.color = style.hl;
    }
    const pop = activeWordTransform(style);
    if (pop) s.transform = transformCss(pop);
  }
  if (style.mode === "dim" && activeIndex >= 0 && index > activeIndex) s.opacity = 0.5;
  if (style.plate) {
    s.background = "rgba(10,10,10,.82)";
    s.borderRadius = 0;
    s.padding = `${u(style.size * 0.12)} ${u(style.size * 0.16)}`;
  }
  return s;
}

/** `cubic-bezier(x1, y1, x2, y2)` as CSS evaluates it: maps linear progress (0–1) to eased progress. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (progress: number) => number {
  const sample = (a: number, b: number, t: number) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t ** 2 + t ** 3;
  return (progress) => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    // x(t) is monotonic for 0 ≤ x1, x2 ≤ 1: bisection always converges.
    let low = 0;
    let high = 1;
    let t = progress;
    for (let i = 0; i < 40; i++) {
      t = (low + high) / 2;
      if (sample(x1, x2, t) < progress) low = t;
      else high = t;
    }
    return sample(y1, y2, t);
  };
}

export const popEasing = cubicBezier(...POP_EASING);

export function interpolateTransform(from: WordTransform, to: WordTransform, eased: number): WordTransform {
  return {
    scale: from.scale + (to.scale - from.scale) * eased,
    rotate: from.rotate + (to.rotate - from.rotate) * eased,
  };
}

/** Font file of each caption face in `packages/shared/fonts` (also loaded by the web app's layout). */
export const CAPTION_FONT_FILES: Record<CaptionStyle["font"], string> = {
  Anton: "Anton-Regular.woff2",
  "Archivo Black": "ArchivoBlack-Regular.woff2",
  "Schibsted Grotesk": "SchibstedGrotesk-Variable.woff2",
  "DM Serif Display": "DMSerifDisplay-Regular.woff2",
};
