/**
 * Subtitle file conversion for the free tools. Pure functions: the tool pages run them
 * in the browser, so the file is never uploaded.
 */
import type { ToolSlug } from "./routes";

/** A file that can't be converted; the message is shown to the user as is. */
export class SubtitleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubtitleError";
  }
}

type Cue = { startMs: number; endMs: number; lines: string[] };

/** Drops a UTF-8 byte order mark and turns CRLF / CR line endings into LF. */
function normalize(input: string): string {
  return input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

/** Blocks separated by blank lines (whitespace-only lines count as blank). */
function blocks(input: string): string[][] {
  const result: string[][] = [];
  let current: string[] = [];
  for (const line of input.split("\n")) {
    if (line.trim() !== "") {
      current.push(line);
    } else if (current.length > 0) {
      result.push(current);
      current = [];
    }
  }
  if (current.length > 0) result.push(current);
  return result;
}

/** `HH:MM:SS,mmm` (SRT allows a dot too, and hours of any width) → milliseconds. */
function parseSrtTime(value: string): number | null {
  const match = /^(\d+):(\d{2}):(\d{2})[,.](\d{3})$/.exec(value);
  if (!match) return null;
  const [hours, minutes, seconds, millis] = match.slice(1).map(Number);
  if (minutes > 59 || seconds > 59) return null;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

/** Milliseconds → `HH:MM:SS<separator>mmm`. */
function formatTime(ms: number, separator: "," | "."): string {
  const millis = ms % 1000;
  const totalSeconds = Math.floor(ms / 1000);
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor(totalSeconds / 60) % 60)}:${pad(totalSeconds % 60)}${separator}${pad(millis, 3)}`;
}

/** `[HH:]MM:SS.mmm` (hours optional, of any width) → milliseconds. */
function parseVttTime(value: string): number | null {
  const match = /^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})$/.exec(value);
  if (!match) return null;
  const [hours, minutes, seconds, millis] = [match[1] ?? "0", match[2], match[3], match[4]].map(Number);
  if (minutes > 59 || seconds > 59) return null;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

type Format = { name: "SRT" | "WebVTT"; parseTime: (value: string) => number | null; timingExample: string; timeExample: string };

const SRT: Format = { name: "SRT", parseTime: parseSrtTime, timingExample: "00:00:01,000 --> 00:00:02,500", timeExample: "00:00:01,000" };
const VTT: Format = { name: "WebVTT", parseTime: parseVttTime, timingExample: "00:00:01.000 --> 00:00:02.500", timeExample: "00:00:01.000" };

const TIMING_LINE = /^\s*(\S+)\s+-->\s+(\S+)(?:\s.*)?$/;

/**
 * One cue block: an optional identifier line (SRT's number, VTT's cue id), the timing
 * line, then the text. Anything after the end time (SRT coordinates, VTT cue settings)
 * is dropped.
 */
function parseCue(lines: string[], cueNumber: number, format: Format): Cue {
  const timingIndex = lines.length > 1 && !lines[0].includes("-->") ? 1 : 0;
  const timing = TIMING_LINE.exec(lines[timingIndex]);
  if (!timing) {
    throw new SubtitleError(`Cue ${cueNumber} has no timing line. Each cue needs one like "${format.timingExample}".`);
  }
  const startMs = format.parseTime(timing[1]);
  const endMs = format.parseTime(timing[2]);
  if (startMs === null || endMs === null) {
    throw new SubtitleError(`Cue ${cueNumber} has an invalid time in "${lines[timingIndex].trim()}". ${format.name} times look like "${format.timeExample}".`);
  }
  if (endMs < startMs) throw new SubtitleError(`Cue ${cueNumber} ends before it starts ("${lines[timingIndex].trim()}").`);
  return { startMs, endMs, lines: lines.slice(timingIndex + 1) };
}

function emptyError(format: Format, extension: string): SubtitleError {
  return new SubtitleError(`The file is empty. Paste ${format.name} text or choose a .${extension} file.`);
}

export function parseSrt(input: string): Cue[] {
  const text = normalize(input);
  if (text.trim() === "") throw emptyError(SRT, "srt");
  return blocks(text).map((lines, index) => parseCue(lines, index + 1, SRT));
}

/** Blocks a VTT file can hold besides cues; none of them has an SRT equivalent. */
const VTT_NON_CUE_BLOCK = /^(?:NOTE|STYLE|REGION)(?:[ \t]|$)/;

export function parseVtt(input: string): Cue[] {
  const text = normalize(input);
  if (text.trim() === "") throw emptyError(VTT, "vtt");
  const [header, ...rest] = blocks(text);
  if (!/^WEBVTT(?:[ \t]|$)/.test(header[0])) {
    throw new SubtitleError('This isn\'t a WebVTT file: the first line should be "WEBVTT". If it\'s an SRT file, use the SRT to VTT converter instead.');
  }
  // Header metadata runs until the first blank line; a timing line in it starts a cue early.
  const earlyCue = header.findIndex((line) => line.includes("-->"));
  const cueBlocks = earlyCue === -1 ? rest : [header.slice(Math.max(1, earlyCue - 1)), ...rest];
  return cueBlocks.filter((lines) => !VTT_NON_CUE_BLOCK.test(lines[0])).map((lines, index) => parseCue(lines, index + 1, VTT));
}

/** SRT → WebVTT: adds the header, writes times with a dot and drops the cue numbers. */
export function srtToVtt(input: string): string {
  const body = parseSrt(input).map((cue) => [`${formatTime(cue.startMs, ".")} --> ${formatTime(cue.endMs, ".")}`, ...cue.lines].join("\n"));
  return `WEBVTT\n\n${body.join("\n\n")}\n`;
}

/**
 * WebVTT → SRT: drops the header and NOTE, STYLE and REGION blocks, cue ids and cue
 * settings, writes full times with a comma and numbers the cues from 1.
 */
export function vttToSrt(input: string): string {
  const cues = parseVtt(input);
  if (cues.length === 0) throw new SubtitleError("This WebVTT file has no cues to convert.");
  const body = cues.map((cue, index) => [String(index + 1), `${formatTime(cue.startMs, ",")} --> ${formatTime(cue.endMs, ",")}`, ...cue.lines].join("\n"));
  return `${body.join("\n\n")}\n`;
}

/** What each tool page converts, from what to what. */
export const CONVERTERS: Record<ToolSlug, { from: string; to: string; mimeType: string; convert: (input: string) => string }> = {
  "srt-to-vtt": { from: "srt", to: "vtt", mimeType: "text/vtt", convert: srtToVtt },
  "vtt-to-srt": { from: "vtt", to: "srt", mimeType: "application/x-subrip", convert: vttToSrt },
};
