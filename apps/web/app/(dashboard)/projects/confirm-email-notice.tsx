"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { outlineButton } from "@/components/ui";

/** Shown until the account's email is confirmed: uploads wait for it (lib/uploads.ts). */
export function ConfirmEmailNotice({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function resend() {
    setState("sending");
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/projects" });
    setState(error ? "failed" : "sent");
  }

  return (
    <section
      aria-labelledby="confirm-email-title"
      className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-panel-1 px-5 py-4"
    >
      <div className="flex max-w-[560px] flex-col gap-1">
        <h2 id="confirm-email-title" className="text-[15px] font-semibold">
          Confirm your email to upload videos
        </h2>
        <p className="text-[13px] text-pretty text-muted" role="status">
          {state === "sent"
            ? `Sent. Check ${email} for the link.`
            : state === "failed"
              ? "We couldn't send it just now. Try again in a few minutes."
              : `We sent a link to ${email}. Open it to start uploading.`}
        </p>
      </div>
      <button type="button" onClick={resend} disabled={state === "sending" || state === "sent"} className={outlineButton}>
        {state === "sending" ? "Sending…" : "Send the link again"}
      </button>
    </section>
  );
}
