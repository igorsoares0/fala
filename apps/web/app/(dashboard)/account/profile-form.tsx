"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { fieldLabel, smallCreamButton, textInput } from "@/components/ui";

export function ProfileForm({ initialName, email }: { initialName: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [newEmail, setNewEmail] = useState(email);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "saved" | "error"; text: string } | null>(null);

  const trimmed = name.trim();
  const trimmedEmail = newEmail.trim().toLowerCase();
  const nameChanged = trimmed !== savedName && trimmed.length > 0;
  const emailChanged = trimmedEmail !== email.toLowerCase() && trimmedEmail !== pendingEmail && /^\S+@\S+\.\S+$/.test(trimmedEmail);
  const dirty = nameChanged || emailChanged;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty) return;
    setBusy(true);
    setStatus(null);
    if (nameChanged) {
      const { error } = await authClient.updateUser({ name: trimmed });
      if (error) {
        setBusy(false);
        setStatus({ kind: "error", text: "We couldn't save your name. Try again." });
        return;
      }
      setSavedName(trimmed);
    }
    if (emailChanged) {
      // The new address must be confirmed first; until then the current one stays active.
      const { error } = await authClient.changeEmail({ newEmail: trimmedEmail, callbackURL: "/account" });
      if (error) {
        setBusy(false);
        setStatus({ kind: "error", text: error.message ?? "We couldn't change your email. Try again." });
        return;
      }
      setPendingEmail(trimmedEmail);
    }
    setBusy(false);
    setStatus({ kind: "saved", text: "Changes saved" });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-4">
        <label className="flex flex-col gap-[7px]">
          <span className={fieldLabel}>Name</span>
          <input
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setStatus(null);
            }}
            autoComplete="name"
            maxLength={80}
            className={textInput}
          />
        </label>
        <label className="flex flex-col gap-[7px]">
          <span className={fieldLabel}>Email</span>
          <input
            name="email"
            type="email"
            value={newEmail}
            onChange={(event) => {
              setNewEmail(event.target.value);
              setStatus(null);
            }}
            autoComplete="email"
            maxLength={320}
            className={textInput}
          />
        </label>
      </div>
      {(pendingEmail || emailChanged) && (
        <p className="text-[13px] text-pretty text-muted">
          We&apos;ll send a confirmation link to {pendingEmail ? <strong className="text-text">{pendingEmail}</strong> : "the new address"}. Until you
          click it, your current email stays active.
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={!dirty || busy} className={smallCreamButton}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        {status && (
          <span
            role="status"
            className={`inline-flex items-center gap-[7px] font-mono text-[11.5px] ${
              status.kind === "error" ? "text-danger-text" : "text-muted"
            }`}
          >
            {status.kind === "saved" && <span className="size-1.5 rounded-full bg-success" aria-hidden />}
            {status.text}
          </span>
        )}
      </div>
    </form>
  );
}
