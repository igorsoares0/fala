import { describe, expect, it } from "vitest";
import { JobError } from "../errors";
import { evaluateProbe } from "./evaluate-probe";
import type { Probe } from "./probe";

const limits = { maxBytes: 1000, maxDurationMs: 180_000 };

function probe(overrides: Partial<Probe> = {}): Probe {
  return {
    format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "12.345" },
    streams: [
      { codec_type: "video", codec_name: "h264", width: 1080, height: 1920 },
      { codec_type: "audio", codec_name: "aac", channels: 2 },
    ],
    ...overrides,
  };
}

function rejection(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    if (error instanceof JobError) return { code: error.code, retryable: error.options.retryable };
    throw error;
  }
  throw new Error("Expected a JobError");
}

describe("evaluateProbe", () => {
  it("returns metadata for a valid video", () => {
    expect(evaluateProbe(probe(), 500, limits)).toEqual({
      durationMs: 12_345,
      width: 1080,
      height: 1920,
      videoCodec: "h264",
      audioCodec: "aac",
    });
  });

  it("swaps dimensions for videos stored sideways (phone rotation)", () => {
    const sideways = probe({
      streams: [
        { codec_type: "video", codec_name: "hevc", width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] },
        { codec_type: "audio", codec_name: "aac" },
      ],
    });
    expect(evaluateProbe(sideways, 500, limits)).toMatchObject({ width: 1080, height: 1920 });

    const legacyTag = probe({
      streams: [
        { codec_type: "video", width: 1920, height: 1080, tags: { rotate: "270" } },
        { codec_type: "audio" },
      ],
    });
    expect(evaluateProbe(legacyTag, 500, limits)).toMatchObject({ width: 1080, height: 1920 });
  });

  it("rejects videos without audio, permanently", () => {
    const silent = probe({ streams: [{ codec_type: "video", width: 720, height: 1280 }] });
    expect(rejection(() => evaluateProbe(silent, 500, limits))).toEqual({ code: "NO_AUDIO", retryable: false });
  });

  it("rejects videos over the duration limit, with a little tolerance", () => {
    expect(evaluateProbe(probe({ format: { format_name: "matroska,webm", duration: 180.4 } }), 500, limits).durationMs).toBe(180_400);
    const long = probe({ format: { format_name: "matroska,webm", duration: "181" } });
    expect(rejection(() => evaluateProbe(long, 500, limits)).code).toBe("VIDEO_TOO_LONG");
  });

  it("rejects files over the size limit", () => {
    expect(rejection(() => evaluateProbe(probe(), 1001, limits)).code).toBe("FILE_TOO_LARGE");
  });

  it("rejects other containers, audio-only files and cover art posing as video", () => {
    expect(rejection(() => evaluateProbe(probe({ format: { format_name: "avi", duration: "3" } }), 1, limits)).code).toBe(
      "UNSUPPORTED_FILE",
    );
    const audioWithCover = probe({
      streams: [
        { codec_type: "video", width: 600, height: 600, disposition: { attached_pic: 1 } },
        { codec_type: "audio", codec_name: "aac" },
      ],
    });
    expect(rejection(() => evaluateProbe(audioWithCover, 1, limits)).code).toBe("UNSUPPORTED_FILE");
    expect(rejection(() => evaluateProbe(probe({ format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2" } }), 1, limits)).code).toBe(
      "UNSUPPORTED_FILE",
    );
  });
});
