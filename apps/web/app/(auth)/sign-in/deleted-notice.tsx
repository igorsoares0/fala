"use client";

import { useSearchParams } from "next/navigation";

/** Shown after an account deletion (handoff §6), which redirects here with ?deleted=1. */
export function DeletedNotice() {
  if (useSearchParams().get("deleted") !== "1") return null;
  return (
    <p role="status" className="mb-6 max-w-[380px] rounded-[12px] border border-line-strong bg-panel-1 px-4 py-3 text-[13.5px] text-pretty text-muted">
      Account deleted. Your files will be removed within 7 days. Thanks for using Supertitle.
    </p>
  );
}
