import { z } from "zod";
import { JobError } from "../errors";
import { CommandError, runCommand } from "./run";

// Only the fields the worker reads. Everything in ffprobe output is untrusted
// (it comes from the uploaded file), so it's parsed, not cast.
const numeric = z.union([z.number(), z.string()]).optional();

const streamSchema = z.object({
  codec_type: z.string().optional(),
  codec_name: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  duration: numeric,
  channels: z.number().optional(),
  disposition: z.object({ attached_pic: z.number().optional() }).partial().optional(),
  tags: z.record(z.string(), z.string()).optional(),
  side_data_list: z.array(z.object({ rotation: numeric }).partial()).optional(),
});

export const probeSchema = z.object({
  streams: z.array(streamSchema).default([]),
  format: z
    .object({
      format_name: z.string().optional(),
      duration: numeric,
    })
    .default({}),
});

export type Probe = z.infer<typeof probeSchema>;
export type ProbeStream = z.infer<typeof streamSchema>;

const PROBE_TIMEOUT_MS = 60_000;

export async function probeFile(ffprobePath: string, filePath: string, signal?: AbortSignal): Promise<Probe> {
  let output: string;
  try {
    output = await runCommand(
      ffprobePath,
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath],
      { timeoutMs: PROBE_TIMEOUT_MS, signal },
    );
  } catch (error) {
    // ffprobe exits non-zero when it can't parse the file: that's the file, not us.
    if (error instanceof CommandError && error.reason === "exit") {
      throw new JobError("UNSUPPORTED_FILE", "ffprobe could not read the file", { retryable: false });
    }
    throw error;
  }

  let json: unknown;
  try {
    json = JSON.parse(output);
  } catch {
    throw new JobError("UNSUPPORTED_FILE", "ffprobe returned unreadable output", { retryable: false });
  }
  const parsed = probeSchema.safeParse(json);
  if (!parsed.success) {
    throw new JobError("UNSUPPORTED_FILE", "ffprobe output had an unexpected shape", { retryable: false });
  }
  return parsed.data;
}
