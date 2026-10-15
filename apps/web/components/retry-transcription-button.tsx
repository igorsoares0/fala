"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Re-runs transcription of the stored video after a recoverable failure. */
export function RetryTranscriptionButton({
  projectId,
  className,
  onError,
}: {
  projectId: string;
  className: string;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function retry() {
    onError(null);
    setBusy(true);
    const response = await fetch(`/api/projects/${projectId}/transcription/retry`, { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      const body = await response?.json().catch(() => null);
      return onError(body?.error ?? "That didn't work. Check your connection and try again.");
    }
    router.refresh();
  }

  return (
    <button type="button" onClick={retry} disabled={busy} className={className}>
      {busy ? "Retrying…" : "Try again"}
    </button>
  );
}
