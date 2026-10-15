import type { CSSProperties } from "react";
import {
  CAPTION_FONT_WEIGHTS,
  CAPTION_REFERENCE_WIDTH,
  contrastTextColor,
  type CaptionStyle,
} from "@fala/shared";

/** Scales a px value authored at the 360px reference width to the container width. */
const u = (value: number) => `${((value / CAPTION_REFERENCE_WIDTH) * 100).toFixed(3)}cqw`;

/** CSS font stacks of the caption faces (loaded with next/font in app/layout.tsx). */
export const CAPTION_FONT_FAMILY: Record<CaptionStyle["font"], string> = {
  Anton: "var(--font-anton)",
  "Archivo Black": "var(--font-archivo-black)",
  "Schibsted Grotesk": "var(--font-schibsted)",
  "DM Serif Display": "var(--font-dm-serif)",
};

/**
 * Static caption overlay: renders `words` in `style` with `activeIndex` as the
 * spoken word. Must sit inside a positioned element with `container-type: inline-size`.
 * Mirrors the preview/render contract in the design handoff ("Caption rendering").
 */
export function CaptionSample({
  style,
  words,
  activeIndex = -1,
}: {
  style: CaptionStyle;
  words: string[];
  activeIndex?: number;
}) {
  const box: CSSProperties = {
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

  return (
    <div style={box} aria-hidden>
      {words.map((word, index) => (
        <span key={index} style={wordStyle(style, index, activeIndex)} data-active={index === activeIndex || undefined}>
          {word}
        </span>
      ))}
    </div>
  );
}

function wordStyle(style: CaptionStyle, index: number, activeIndex: number): CSSProperties {
  const s: CSSProperties = {
    fontFamily: CAPTION_FONT_FAMILY[style.font],
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
    transition: "transform 120ms cubic-bezier(.3,1.7,.5,1)",
  };

  if (index === activeIndex) {
    if (style.mode === "box") {
      s.background = style.hl;
      s.color = contrastTextColor(style.hl);
      s.WebkitTextStroke = "0";
      s.textShadow = "none";
      if (style.anim === "pop") s.transform = "scale(1.1) rotate(-2deg)";
    } else if (style.mode === "text") {
      s.color = style.hl;
      if (style.anim === "pop") s.transform = "scale(1.12)";
    } else if (style.anim === "pop") {
      s.transform = "scale(1.06)";
    }
  }
  if (style.mode === "dim" && activeIndex >= 0 && index > activeIndex) s.opacity = 0.5;
  if (style.plate) {
    s.background = "rgba(10,10,10,.82)";
    s.borderRadius = 0;
    s.padding = `${u(style.size * 0.12)} ${u(style.size * 0.16)}`;
  }
  return s;
}
