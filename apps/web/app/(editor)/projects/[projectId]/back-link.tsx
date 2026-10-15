"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hasUnsyncedChanges, useSaveStatus } from "@/lib/save-status";

/**
 * "← Projects". With changes the server doesn't have yet (offline, failed or
 * conflicting saves) it asks first, using the handoff's "unsynced" dialog.
 */
export function BackLink() {
  const router = useRouter();
  const unsynced = useSaveStatus((store) => hasUnsyncedChanges(store.entries));
  const [asking, setAsking] = useState(false);

  return (
    <>
      <Link
        href="/projects"
        onClick={(event) => {
          if (!unsynced) return;
          event.preventDefault();
          setAsking(true);
        }}
        className="rounded-lg px-2.5 py-1.5 text-[13.5px] font-semibold text-muted transition-colors hover:bg-panel-1 hover:text-text"
      >
        ← <span className="max-[719px]:sr-only">Projects</span>
      </Link>
      {asking && (
        <div
          className="fixed inset-0 z-30 grid place-items-center bg-[rgba(8,7,6,.62)] p-6 backdrop-blur-[6px]"
          onClick={() => setAsking(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="unsynced-title"
            aria-describedby="unsynced-body"
            onClick={(event) => event.stopPropagation()}
            className="flex w-full max-w-[420px] flex-col gap-3 rounded-[18px] border border-line bg-panel-1 p-6"
          >
            <span id="unsynced-title" className="text-[22px] font-bold tracking-[-0.03em]">
              Some changes haven&apos;t synced yet
            </span>
            <span id="unsynced-body" className="text-sm text-pretty text-muted">
              They&apos;re kept in this browser and will sync when you&apos;re back online. If you leave now and clear your
              browser data, they&apos;ll be lost.
            </span>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => router.push("/projects")}
                className="rounded-[9px] border border-line-button px-3.5 py-2 text-[13.5px] font-semibold text-text hover:bg-panel-2"
              >
                Leave anyway
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => setAsking(false)}
                className="rounded-[9px] bg-text px-3.5 py-2 text-[13.5px] font-semibold text-ink hover:bg-white"
              >
                Stay in editor
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
