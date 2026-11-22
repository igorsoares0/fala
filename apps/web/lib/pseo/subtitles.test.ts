import { describe, expect, it } from "vitest";
import { SubtitleError, srtToVtt, vttToSrt } from "./subtitles";

const SRT = `1
00:00:01,000 --> 00:00:02,500
Hello there.

2
00:00:03,000 --> 00:00:05,250
Two lines
in one cue.
`;

const VTT = `WEBVTT

00:00:01.000 --> 00:00:02.500
Hello there.

00:00:03.000 --> 00:00:05.250
Two lines
in one cue.
`;

describe("srtToVtt", () => {
  it("adds the header, writes times with a dot and drops the cue numbers", () => {
    expect(srtToVtt(SRT)).toBe(VTT);
  });

  it("keeps multi-line cues and their line breaks", () => {
    const vtt = srtToVtt("1\n00:00:00,000 --> 00:00:01,000\nfirst\nsecond\nthird\n");
    expect(vtt).toContain("first\nsecond\nthird");
  });

  it("handles a UTF-8 byte order mark", () => {
    expect(srtToVtt(`﻿${SRT}`)).toBe(VTT);
  });

  it("handles CRLF and CR line endings", () => {
    expect(srtToVtt(SRT.replace(/\n/g, "\r\n"))).toBe(VTT);
    expect(srtToVtt(SRT.replace(/\n/g, "\r"))).toBe(VTT);
  });

  it("tolerates extra blank lines, whitespace-only lines and a missing final newline", () => {
    const messy = `\n\n1\n00:00:01,000 --> 00:00:02,500\nHello there.\n   \n\n\n2\n00:00:03,000 --> 00:00:05,250\nTwo lines\nin one cue.`;
    expect(srtToVtt(messy)).toBe(VTT);
  });

  it("accepts cues without a number and pads short hours", () => {
    expect(srtToVtt("0:00:01,000 --> 0:00:02,000\nHi\n")).toBe("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n");
  });

  it("drops SRT position coordinates after the timing", () => {
    expect(srtToVtt("1\n00:00:01,000 --> 00:00:02,000 X1:10 X2:100 Y1:10 Y2:50\nHi\n")).toContain("00:00:01.000 --> 00:00:02.000\nHi");
  });

  it("keeps non-ASCII text untouched", () => {
    expect(srtToVtt("1\n00:00:01,000 --> 00:00:02,000\nAção — 日本語 <i>ok</i>\n")).toContain("Ação — 日本語 <i>ok</i>");
  });

  it("rejects empty input", () => {
    expect(() => srtToVtt("")).toThrow(SubtitleError);
    expect(() => srtToVtt(" \n\r\n﻿")).toThrow(/empty/);
    expect(() => srtToVtt("﻿")).toThrow(/empty/);
  });

  it("rejects a cue without a timing line, naming the cue", () => {
    expect(() => srtToVtt(`${SRT}\n3\nno timing here\n`)).toThrow(/Cue 3 has no timing line/);
    expect(() => srtToVtt("just some text")).toThrow(SubtitleError);
  });

  it("rejects invalid times", () => {
    expect(() => srtToVtt("1\n00:00:01 --> 00:00:02,000\nHi\n")).toThrow(/Cue 1 has an invalid time/);
    expect(() => srtToVtt("1\n00:61:01,000 --> 00:62:02,000\nHi\n")).toThrow(/invalid time/);
    expect(() => srtToVtt("1\n00:00:05,000 --> 00:00:02,000\nHi\n")).toThrow(/ends before it starts/);
  });
});

const RICH_VTT = `WEBVTT - Interview
Kind: captions
Language: en

NOTE This file was exported
from an editor.

STYLE
::cue { color: yellow; }

REGION
id:speaker width:40%

intro
00:01.000 --> 00:02.500 align:start position:10%
Hello there.

NOTE another note

00:00:03.000 --> 00:00:05.250 line:85%
Two lines
in one cue.
`;

describe("vttToSrt", () => {
  it("strips the header, NOTE, STYLE and REGION blocks, cue ids and settings, and numbers the cues", () => {
    expect(vttToSrt(RICH_VTT)).toBe(SRT);
  });

  it("adds missing hour fields and writes times with a comma", () => {
    expect(vttToSrt("WEBVTT\n\n01:02.345 --> 1:01:02.000\nHi\n")).toBe("1\n00:01:02,345 --> 01:01:02,000\nHi\n");
  });

  it("keeps multi-line cues and their line breaks", () => {
    expect(vttToSrt("WEBVTT\n\n00:00.000 --> 00:01.000\nfirst\nsecond\nthird\n")).toContain("first\nsecond\nthird");
  });

  it("handles a UTF-8 byte order mark and CRLF / CR line endings", () => {
    expect(vttToSrt(`﻿${VTT}`)).toBe(SRT);
    expect(vttToSrt(VTT.replace(/\n/g, "\r\n"))).toBe(SRT);
    expect(vttToSrt(VTT.replace(/\n/g, "\r"))).toBe(SRT);
  });

  it("accepts a cue that starts right after the header line", () => {
    expect(vttToSrt("WEBVTT\n00:00:01.000 --> 00:00:02.000\nHi\n")).toBe("1\n00:00:01,000 --> 00:00:02,000\nHi\n");
  });

  it("rejects empty input", () => {
    expect(() => vttToSrt("")).toThrow(/empty/);
    expect(() => vttToSrt("﻿\r\n  \r\n")).toThrow(/empty/);
  });

  it("rejects a file without the WEBVTT header, pointing SRT files to the other tool", () => {
    expect(() => vttToSrt(SRT)).toThrow(/first line should be "WEBVTT".*SRT to VTT/);
  });

  it("rejects a file with no cues", () => {
    expect(() => vttToSrt("WEBVTT\n\nNOTE nothing here\n")).toThrow(/no cues/);
  });

  it("rejects cues without a timing line or with invalid times, naming the cue", () => {
    expect(() => vttToSrt(`${VTT}\njust text\n`)).toThrow(/Cue 3 has no timing line/);
    expect(() => vttToSrt("WEBVTT\n\n00:00:01,000 --> 00:00:02,000\nHi\n")).toThrow(/Cue 1 has an invalid time.*00:00:01\.000/);
    expect(() => vttToSrt("WEBVTT\n\n00:70.000 --> 00:71.000\nHi\n")).toThrow(/invalid time/);
    expect(() => vttToSrt("WEBVTT\n\n00:05.000 --> 00:02.000\nHi\n")).toThrow(/ends before it starts/);
  });
});

describe("round trips", () => {
  it("SRT → VTT → SRT gives back the SRT", () => {
    expect(vttToSrt(srtToVtt(SRT))).toBe(SRT);
  });

  it("VTT → SRT → VTT gives back the cues without ids and settings", () => {
    expect(srtToVtt(vttToSrt(VTT))).toBe(VTT);
    expect(srtToVtt(vttToSrt(RICH_VTT))).toBe(VTT);
  });
});
