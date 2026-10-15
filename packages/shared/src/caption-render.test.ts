import { describe, expect, it } from "vitest";
import {
  activeWordTransform,
  captionBoxStyle,
  captionWordStyle,
  cubicBezier,
  interpolateTransform,
  popEasing,
  transformCss,
} from "./caption-render";
import { PRESETS } from "./style";

const bold = PRESETS.bold.style;

describe("caption CSS", () => {
  it("scales sizes from the 360px reference to the container width", () => {
    const word = captionWordStyle(bold, 0, -1, "Anton");
    expect(word.fontSize).toBe("10.556cqw"); // 38 / 360
    expect(word.WebkitTextStroke).toBe("0.833cqw #000");
    expect(word.fontWeight).toBe(400);
  });

  it("places the block at the style's position", () => {
    expect(captionBoxStyle({ ...bold, pos: "mid" })).toMatchObject({ top: "50%", transform: "translateY(-50%)" });
    expect(captionBoxStyle({ ...bold, pos: "top" })).toMatchObject({ top: "13%" });
    expect(captionBoxStyle({ ...bold, pos: "bottom" })).toMatchObject({ bottom: "14%" });
  });

  it("boxes the spoken word with legible text and pops it", () => {
    const active = captionWordStyle(bold, 1, 1, "Anton");
    expect(active).toMatchObject({ background: "#ffd400", color: "#111111", WebkitTextStroke: "0", transform: "scale(1.1) rotate(-2deg)" });
    expect(captionWordStyle(bold, 0, 1, "Anton").transform).toBeUndefined();
  });

  it("colors the spoken word in text mode and dims upcoming words in dim mode", () => {
    expect(captionWordStyle(PRESETS.word.style, 0, 0, "x")).toMatchObject({ color: "#3ee07a", transform: "scale(1.12)" });
    const podcast = PRESETS.podcast.style;
    expect(captionWordStyle(podcast, 2, 1, "x").opacity).toBe(0.5);
    expect(captionWordStyle(podcast, 0, 1, "x").opacity).toBeUndefined();
    expect(captionWordStyle(podcast, 1, 1, "x").transform).toBeUndefined();
  });

  it("draws the plate without rounding", () => {
    expect(captionWordStyle(PRESETS.classic.style, 0, -1, "x")).toMatchObject({ background: "rgba(10,10,10,.82)", borderRadius: 0 });
  });
});

describe("pop transition", () => {
  it("only moves words when the style pops", () => {
    expect(activeWordTransform(PRESETS.classic.style)).toBeNull();
    expect(activeWordTransform({ ...PRESETS.podcast.style, anim: "pop" })).toEqual({ scale: 1.06, rotate: 0 });
  });

  it("follows the CSS cubic-bezier curve, overshoot included", () => {
    const linear = cubicBezier(0, 0, 1, 1);
    expect(linear(0.25)).toBeCloseTo(0.25, 4);
    expect(popEasing(0)).toBe(0);
    expect(popEasing(1)).toBe(1);
    // cubic-bezier(.3,1.7,.5,1) overshoots past the end value before settling.
    expect(Math.max(...[0.4, 0.5, 0.6, 0.7].map(popEasing))).toBeGreaterThan(1);
  });

  it("interpolates scale and rotation as CSS transitions do", () => {
    const halfway = interpolateTransform({ scale: 1, rotate: 0 }, { scale: 1.1, rotate: -2 }, 0.5);
    expect(halfway.scale).toBeCloseTo(1.05);
    expect(halfway.rotate).toBeCloseTo(-1);
    expect(transformCss({ scale: 1, rotate: 0 })).toBe("none");
    expect(transformCss({ scale: 1.05, rotate: 0 })).toBe("scale(1.05)");
  });
});
