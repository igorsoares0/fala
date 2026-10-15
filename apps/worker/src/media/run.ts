import { spawn } from "node:child_process";

export class CommandError extends Error {
  constructor(
    message: string,
    readonly reason: "exit" | "timeout" | "output-limit" | "spawn" | "aborted",
    readonly stderr: string,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

type RunOptions = {
  timeoutMs: number;
  /** Bytes of stdout kept before the process is killed. */
  maxOutputBytes?: number;
  signal?: AbortSignal;
  /** Receives stdout as it arrives (e.g. FFmpeg's `-progress pipe:1`); stdout is then not collected. */
  onStdout?: (chunk: string) => void;
};

const STDERR_TAIL_BYTES = 4_000;

/**
 * Runs a binary with an argument array — never through a shell, so file names and
 * metadata can't be interpreted as commands (spec §7.5). Kills it on timeout,
 * abort, or when stdout grows past the limit.
 */
export function runCommand(binary: string, args: string[], options: RunOptions): Promise<string> {
  const maxOutputBytes = options.maxOutputBytes ?? 1_000_000;

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = "";
    let failure: CommandError | null = null;

    const stop = (error: CommandError) => {
      failure ??= error;
      child.kill("SIGKILL");
    };

    const timer = setTimeout(() => stop(new CommandError(`${binary} timed out`, "timeout", stderr)), options.timeoutMs);
    const onAbort = () => stop(new CommandError(`${binary} aborted`, "aborted", stderr));
    options.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk: Buffer) => {
      if (options.onStdout) return options.onStdout(chunk.toString("utf8"));
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxOutputBytes) stop(new CommandError(`${binary} output too large`, "output-limit", stderr));
      else stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-STDERR_TAIL_BYTES);
    });

    child.on("error", (error) => {
      failure ??= new CommandError(`${binary} could not start: ${error.message}`, "spawn", stderr);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (failure) return reject(failure);
      if (code !== 0) return reject(new CommandError(`${binary} exited with code ${code}`, "exit", stderr));
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });
}
