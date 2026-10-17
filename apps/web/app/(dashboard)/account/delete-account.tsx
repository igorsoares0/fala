"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { outlineButton, textInput } from "@/components/ui";

/** Account → Delete account (handoff §6): typing the account email unlocks "Delete forever". */
export function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  async function deleteForever() {
    setBusy(true);
    setError(null);
    const { error } = await authClient.deleteUser({ callbackURL: "/sign-in?deleted=1" });
    if (error) {
      setBusy(false);
      setError(
        error.code === "SESSION_EXPIRED"
          ? "For your security, sign out and sign in again, then delete your account."
          : (error.message ?? "We couldn't delete your account. Try again."),
      );
      return;
    }
    // A full page load, so nothing of the deleted account stays in the client (router cache, kept pages).
    window.location.replace("/sign-in?deleted=1");
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-4" aria-labelledby="delete-title">
      <div className="flex max-w-[420px] flex-col gap-[3px]">
        <h2 id="delete-title" className="text-[15px] font-semibold">
          Delete account
        </h2>
        <span className="text-[13px] text-pretty text-muted">Removes your projects, exports and subscription. This can&apos;t be undone.</span>
      </div>
      <button type="button" onClick={() => setOpen(true)} className={`${outlineButton} border-danger text-danger-text`}>
        Delete account
      </button>

      {open && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-[rgba(8,7,6,.62)] p-4 backdrop-blur-[6px]" onClick={() => !busy && setOpen(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            onClick={(event) => event.stopPropagation()}
            className="flex w-[min(460px,100%)] flex-col gap-4 rounded-[18px] border border-line bg-panel-1 p-[26px]"
          >
            <h3 id="delete-dialog-title" className="text-[24px] font-bold tracking-[-0.03em]">
              Delete your account?
            </h3>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-[14px] text-muted">
              <li>All your projects and captions</li>
              <li>All exports</li>
              <li>Your subscription, canceled right away</li>
              <li>Stored videos and files, removed within 7 days</li>
            </ul>
            <label className="flex flex-col gap-[7px] text-[13px]">
              <span className="text-muted">
                Type <strong className="text-text">{email}</strong> to confirm
              </span>
              <input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" className={textInput} aria-label="Account email" />
            </label>
            {error && (
              <p role="alert" className="text-[13px] text-danger-text">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className={outlineButton}>
                Keep my account
              </button>
              <button
                type="button"
                onClick={deleteForever}
                disabled={!matches || busy}
                className="rounded-[9px] bg-danger px-3.5 py-2 text-[13.5px] font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Deleting…" : "Delete forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
