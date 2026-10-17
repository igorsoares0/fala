import { NextResponse } from "next/server";
import { handlePaddleEvent } from "@/lib/billing-sync";
import { getPaddle, paddleSettings, toSubscriptionState } from "@/lib/paddle";

/**
 * POST ← Paddle webhooks (spec FR-13). The signature is checked against the raw body
 * before anything is read. A 2xx tells Paddle the event is handled; on our errors it
 * gets a 500 and retries later, and the event id makes the retry safe.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("paddle-signature") ?? "";
  const body = await request.text();

  let event;
  try {
    event = await getPaddle().webhooks.unmarshal(body, paddleSettings().webhookSecret, signature);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const result = await handlePaddleEvent(
    { eventId: event.eventId, eventType: event.eventType, data: event.data },
    (data) => toSubscriptionState(data as Parameters<typeof toSubscriptionState>[0]),
  );
  console.info(JSON.stringify({ event: "paddle.webhook", type: event.eventType, eventId: event.eventId, result }));
  return NextResponse.json({ ok: true });
}
