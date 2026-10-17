/**
 * Local Paddle webhooks: opens a public tunnel to the dev server (cloudflared quick
 * tunnel) and points the sandbox notification destination "Fala local dev" at it.
 *
 *   npm run paddle:tunnel            # tunnels http://localhost:3000
 *
 * The first run creates the destination and prints its secret: put it in .env as
 * PADDLE_WEBHOOK_SECRET and restart the dev server. Keep this running while testing.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { Environment, EventName, Paddle } from "@paddle/paddle-node-sdk";

const DESCRIPTION = "Fala local dev";
const PORT = process.env.PORT ?? "3000";
const EVENTS = [
  EventName.SubscriptionCreated,
  EventName.SubscriptionUpdated,
  EventName.SubscriptionActivated,
  EventName.SubscriptionPastDue,
  EventName.SubscriptionPaused,
  EventName.SubscriptionResumed,
  EventName.SubscriptionCanceled,
  EventName.TransactionCompleted,
];

// On WSL the Windows build works too: Windows forwards localhost into WSL.
const CLOUDFLARED =
  ["/mnt/c/Program Files (x86)/cloudflared/cloudflared.exe", "/mnt/c/Program Files/cloudflared/cloudflared.exe"].find((path) => existsSync(path)) ??
  "cloudflared";

async function main() {
  if (process.env.PADDLE_ENV === "production") throw new Error("This script is for the sandbox only.");
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) throw new Error("Set PADDLE_API_KEY in .env first.");
  const paddle = new Paddle(apiKey, { environment: Environment.sandbox });

  const tunnel = spawn(CLOUDFLARED, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${PORT}`], { stdio: ["ignore", "pipe", "pipe"] });
  const url = await new Promise<string>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(chunk.toString());
      if (match) resolve(match[0]);
    };
    tunnel.stdout.on("data", onData);
    tunnel.stderr.on("data", onData);
    tunnel.on("error", reject);
    tunnel.on("exit", (code) => reject(new Error(`cloudflared exited with code ${code}`)));
  });
  const destination = `${url}/api/webhooks/paddle`;

  const existing = (await paddle.notificationSettings.list()).find((setting) => setting.description === DESCRIPTION);
  if (existing) {
    await paddle.notificationSettings.update(existing.id, { destination, active: true, subscribedEvents: EVENTS });
    console.log(`Webhooks → ${destination}`);
  } else {
    const created = await paddle.notificationSettings.create({ description: DESCRIPTION, destination, subscribedEvents: EVENTS, type: "url" });
    console.log(`Webhooks → ${destination}`);
    console.log(`New destination. Put this in .env and restart the dev server:\n  PADDLE_WEBHOOK_SECRET="${created.endpointSecretKey}"`);
  }
  console.log("Tunnel open. Ctrl+C to stop.");
  const stop = () => {
    tunnel.kill();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
