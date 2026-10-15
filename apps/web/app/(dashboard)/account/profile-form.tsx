"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { fieldLabel, smallCreamButton, textInput } from "@/components/ui";

export function ProfileForm({ initialName, email }: { initialName: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "saved" | "error"; text: string } | null>(null);

  const trimmed = name.trim();
  const dirty = trimmed !== savedName && trimmed.length > 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty) return;
    setBusy(true);
    setStatus(null);
    const { error } = await authClient.updateUser({ name: trimmed });
    setBusy(false);
    if (error) {
      setStatus({ kind: "error", text: "We couldn't save your name. Try again." });
      return;
    }
    setSavedName(trimmed);
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
          <input value={email} readOnly aria-readonly className={`${textInput} text-muted`} />
        </label>
      </div>
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
