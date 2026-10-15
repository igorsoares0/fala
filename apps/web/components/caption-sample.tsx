import type { CSSProperties } from "react";
import { captionBoxStyle, captionWordStyle, type CaptionStyle } from "@fala/shared";

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
 * The CSS comes from @fala/shared, which the export renderer uses too.
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
  const fontFamily = CAPTION_FONT_FAMILY[style.font];
  return (
    <div style={captionBoxStyle(style) as CSSProperties} aria-hidden>
      {words.map((word, index) => (
        <span
          key={index}
          style={captionWordStyle(style, index, activeIndex, fontFamily) as CSSProperties}
          data-active={index === activeIndex || undefined}
        >
          {word}
        </span>
      ))}
    </div>
  );
}
