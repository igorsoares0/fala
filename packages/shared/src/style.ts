import { z } from "zod";

/**
 * Caption style contract shared by the editor preview and the export renderer.
 * All pixel sizes are authored against a 360px-wide frame; renderers scale them
 * by `outputWidth / CAPTION_REFERENCE_WIDTH`.
 */
export const CAPTION_REFERENCE_WIDTH = 360;

export const CAPTION_FONTS = [
  "Anton",
  "Archivo Black",
  "Schibsted Grotesk",
  "DM Serif Display",
] as const;

export type CaptionFont = (typeof CAPTION_FONTS)[number];

/** Weight each caption face is rendered at. */
export const CAPTION_FONT_WEIGHTS: Record<CaptionFont, number> = {
  Anton: 400,
  "Archivo Black": 400,
  "Schibsted Grotesk": 700,
  "DM Serif Display": 400,
};

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const captionStyleSchema = z.object({
  font: z.enum(CAPTION_FONTS),
  /** Font size in px at the reference width. */
  size: z.number().min(14).max(54),
  /** Render text in uppercase. */
  upper: z.boolean(),
  /** Text color. */
  color: hexColorSchema,
  /** Highlight color for the spoken word. */
  hl: hexColorSchema,
  /** Spoken-word highlight: filled box, colored text, dim upcoming words, or none. */
  mode: z.enum(["box", "text", "dim", "none"]),
  outline: z.boolean(),
  /** Outline thickness in px at the reference width. */
  ow: z.number().min(1).max(6),
  shadow: z.boolean(),
  /** Dark bar behind the words. */
  plate: z.boolean(),
  pos: z.enum(["top", "mid", "bottom"]),
  anim: z.enum(["none", "pop"]),
  /** Maximum words per caption block (drives segmentation). */
  maxW: z.number().int().min(1).max(10),
});

export type CaptionStyle = z.infer<typeof captionStyleSchema>;

export const PRESET_KEYS = ["bold", "word", "podcast", "classic", "minimal"] as const;

export const presetKeySchema = z.enum(PRESET_KEYS);

export type PresetKey = z.infer<typeof presetKeySchema>;

export interface CaptionPreset {
  key: PresetKey;
  name: string;
  style: CaptionStyle;
}

export const PRESETS: Record<PresetKey, CaptionPreset> = {
  bold: {
    key: "bold",
    name: "Bold Highlight",
    style: {
      font: "Anton",
      size: 38,
      upper: true,
      color: "#ffffff",
      hl: "#ffd400",
      mode: "box",
      outline: true,
      ow: 3,
      shadow: true,
      plate: false,
      pos: "mid",
      anim: "pop",
      maxW: 3,
    },
  },
  word: {
    key: "word",
    name: "Word Highlight",
    style: {
      font: "Archivo Black",
      size: 27,
      upper: false,
      color: "#ffffff",
      hl: "#3ee07a",
      mode: "text",
      outline: true,
      ow: 2.5,
      shadow: true,
      plate: false,
      pos: "bottom",
      anim: "pop",
      maxW: 4,
    },
  },
  podcast: {
    key: "podcast",
    name: "Clean Podcast",
    style: {
      font: "Schibsted Grotesk",
      size: 23,
      upper: false,
      color: "#ffffff",
      hl: "#ffffff",
      mode: "dim",
      outline: false,
      ow: 2,
      shadow: true,
      plate: false,
      pos: "bottom",
      anim: "none",
      maxW: 6,
    },
  },
  classic: {
    key: "classic",
    name: "Classic",
    style: {
      font: "Schibsted Grotesk",
      size: 19,
      upper: false,
      color: "#ffffff",
      hl: "#ffd400",
      mode: "none",
      outline: false,
      ow: 2,
      shadow: false,
      plate: true,
      pos: "bottom",
      anim: "none",
      maxW: 7,
    },
  },
  minimal: {
    key: "minimal",
    name: "Minimal",
    style: {
      font: "DM Serif Display",
      size: 26,
      upper: false,
      color: "#f4efe6",
      hl: "#ffd400",
      mode: "none",
      outline: false,
      ow: 2,
      shadow: true,
      plate: false,
      pos: "bottom",
      anim: "none",
      maxW: 5,
    },
  },
};

export const DEFAULT_PRESET_KEY: PresetKey = "bold";

/** Text color that stays legible on top of `background` (used for the "box" highlight). */
export function contrastTextColor(background: string): "#111111" | "#ffffff" {
  const value = parseInt(background.slice(1), 16);
  const r = value >> 16;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#111111" : "#ffffff";
}
