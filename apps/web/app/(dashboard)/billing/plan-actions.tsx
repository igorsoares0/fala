"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { outlineButton } from "@/components/ui";
import { cancelPlanAction, keepPlanAction, portalUrlAction } from "@/lib/billing-actions";

/** The plan card's buttons: Paddle's portal, and cancelling or keeping a paid plan. */
export function PlanActions({ subscribed, scheduled, canManage }: { subscribed: boolean; scheduled: boolean; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      setConfirming(false);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canManage || pending}
          title={canManage ? undefined : "Available once you're on a paid plan"}
          onClick={() =>
            start(async () => {
              const result = await portalUrlAction();
              if (result.ok) window.location.assign(result.url);
              else setError(result.error);
            })
          }
          className={outlineButton}
        >
          Payment &amp; invoices
        </button>
        {subscribed &&
          (scheduled ? (
            <button type="button" disabled={pending} onClick={() => run(keepPlanAction)} className={outlineButton}>
              Keep my plan
            </button>
          ) : (
            <button type="button" disabled={pending} onClick={() => setConfirming(true)} className={`${outlineButton} text-muted`}>
              Cancel plan
            </button>
          ))}
      </div>
      {confirming && (
        <div role="alertdialog" aria-label="Cancel your plan?" className="flex flex-col gap-2 rounded-[12px] border border-line-strong p-4 text-[13.5px]">
          <span className="font-semibold">Cancel your plan?</span>
          <span className="text-muted">You keep it until the end of this period, then move to Free. Your projects stay.</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirming(false)} className={outlineButton}>
              Keep it
            </button>
            <button type="button" disabled={pending} onClick={() => run(cancelPlanAction)} className={`${outlineButton} border-danger text-danger-text`}>
              Cancel at period end
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
