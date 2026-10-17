"use client";

import { useState, useTransition } from "react";
import { outlineButton } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { setEmailOnExportAction } from "@/lib/account-actions";

/** Account → Preferences (handoff §6): password and the export-email switch. */
export function Preferences({ email, hasPassword, emailOnExport }: { email: string; hasPassword: boolean; emailOnExport: boolean }) {
  const [linkSent, setLinkSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onExport, setOnExport] = useState(emailOnExport);
  const [saving, startSaving] = useTransition();

  async function sendLink() {
    setSending(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setSending(false);
    if (error) setError("We couldn't send the link. Try again in a moment.");
    else setLinkSent(true);
  }

  return (
    <section className="flex flex-col gap-6 border-b border-line pb-9" aria-labelledby="preferences-title">
      <h2 id="preferences-title" className="text-[22px] font-bold tracking-[-0.03em]">
        Preferences
      </h2>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[420px] flex-col gap-[3px]">
          <span className="text-[15px] font-semibold">Password</span>
          <span className="text-[13px] text-pretty text-muted">
            {linkSent
              ? `Link sent to ${email}. It expires in 30 minutes.`
              : hasPassword
                ? "We'll email you a link to choose a new password."
                : "You sign in with Google. You can also create a password, to sign in with your email."}
          </span>
          {error && (
            <span role="alert" className="text-[13px] text-danger-text">
              {error}
            </span>
          )}
        </div>
        <button type="button" onClick={sendLink} disabled={sending} className={outlineButton}>
          {sending ? "Sending…" : linkSent ? "Resend link" : hasPassword ? "Change password" : "Create password"}
        </button>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-[3px]">
          <span id="export-email-label" className="text-[15px] font-semibold">
            Email me when an export finishes
          </span>
          <span className="text-[13px] text-muted">Handy for long videos: close the tab, we&apos;ll let you know.</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={onExport}
          aria-labelledby="export-email-label"
          disabled={saving}
          onClick={() => {
            const next = !onExport;
            setOnExport(next);
            startSaving(async () => {
              const result = await setEmailOnExportAction(next);
              if (!result.ok) setOnExport(!next);
            });
          }}
          className={`relative h-5 w-[34px] shrink-0 rounded-full transition-colors ${onExport ? "bg-accent" : "bg-[rgba(236,230,218,.2)]"}`}
        >
          <span className={`absolute top-0.5 size-4 rounded-full bg-text transition-[left] ${onExport ? "left-4" : "left-0.5"}`} />
        </button>
      </div>
    </section>
  );
}
