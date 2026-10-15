import { setTimeout as sleep } from "node:timers/promises";
import { db } from "@fala/db";
import { createStorage } from "@fala/storage";
import { loadConfig } from "./config";
import { log, sanitizeErrorMessage } from "./log";
import { createRunner } from "./runner";
import { sweepStaleTempDirs } from "./temp";

const STALE_TEMP_DIR_MS = 60 * 60_000;

async function main() {
  const config = loadConfig();
  const storage = createStorage(config.storage);
  const runner = createRunner({ config, storage });
  const stop = new AbortController();

  const swept = await sweepStaleTempDirs(config.tempDir, STALE_TEMP_DIR_MS);
  log.info("worker.started", { workerId: config.workerId, concurrency: config.concurrency, sweptTempDirs: swept });

  async function loop() {
    while (!stop.signal.aborted) {
      let didWork = false;
      try {
        didWork = await runner.processNextJob();
      } catch (error) {
        log.error("worker.poll_failed", { error: sanitizeErrorMessage(error) });
      }
      if (!didWork) await sleep(config.pollIntervalMs, undefined, { signal: stop.signal }).catch(() => {});
    }
  }

  const loops = Promise.all(Array.from({ length: config.concurrency }, loop));

  // Graceful shutdown (spec §18.2): stop claiming, let running jobs finish within the
  // grace period, then release whatever is left so another worker can take it.
  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("worker.stopping", { signal, running: runner.inFlightCount() });
    stop.abort();
    const finished = await Promise.race([loops.then(() => true), sleep(config.shutdownGraceMs).then(() => false)]);
    if (!finished) {
      runner.interruptAll();
      await loops;
    }
    await db.$disconnect();
    log.info("worker.stopped", { signal });
    process.exit(0);
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  await loops;
}

main().catch((error) => {
  log.error("worker.crashed", { error: sanitizeErrorMessage(error) });
  process.exit(1);
});
