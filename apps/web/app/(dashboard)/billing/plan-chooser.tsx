"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { PLAN_KEYS, PLANS, type Plan, type PlanKey } from "@fala/shared";
import { accentButton, outlineButton, smallCreamButton } from "@/components/ui";
import { changePlanAction, currentPlanAction, previewPlanChangeAction } from "@/lib/billing-actions";

type Interval = "month" | "year";
type PaidPlan = Exclude<PlanKey, "free">;

export type CheckoutConfig = {
  environment: "sandbox" | "production";
  clientToken: string;
  prices: Record<PaidPlan, Record<Interval, string>>;
  email: string;
  userId: string;
};

/**
 * The plans grid with its monthly/yearly toggle (handoff §5). Free users subscribe
 * through Paddle Checkout; subscribers change plans through the review → waiting →
 * done modal. The plan only changes once Paddle confirms it (webhook).
 */
export function PlanChooser({
  current,
  interval: currentInterval,
  subscribed,
  checkout,
}: {
  current: PlanKey;
  interval: Interval;
  subscribed: boolean;
  checkout: CheckoutConfig | null;
}) {
  const [interval, setInterval] = useState<Interval>(currentInterval);
  const [change, setChange] = useState<{ plan: PaidPlan; interval: Interval } | null>(null);
  const [waitingFor, setWaitingFor] = useState<PaidPlan | null>(null);
  const paddle = usePaddle(checkout, (plan) => setWaitingFor(plan));

  function choose(plan: PaidPlan) {
    if (subscribed) return setChange({ plan, interval });
    if (!checkout || !paddle) return;
    paddle.Checkout.open({
      items: [{ priceId: checkout.prices[plan][interval], quantity: 1 }],
      customer: { email: checkout.email },
      customData: { userId: checkout.userId, plan },
      settings: { displayMode: "overlay", theme: "dark" },
    });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h2 id="plans-title" className="font-mono text-[11.5px] tracking-[0.08em] text-muted">
          PLANS
        </h2>
        <div role="radiogroup" aria-label="Billing" className="flex rounded-full border border-line-strong p-0.5 text-[13px] font-semibold">
          {(["month", "year"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={interval === value}
              onClick={() => setInterval(value)}
              className={`rounded-full px-3.5 py-1 transition-colors ${interval === value ? "bg-text text-ink" : "text-muted hover:text-text"}`}
            >
              {value === "month" ? "Monthly" : "Yearly · save 25%"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
        {PLAN_KEYS.map((key) => (
          <PlanOption
            key={key}
            plan={PLANS[key]}
            current={PLANS[current]}
            interval={interval}
            sameInterval={interval === currentInterval}
            available={subscribed || Boolean(paddle)}
            onChoose={choose}
          />
        ))}
      </div>
      {change && <ChangeDialog {...change} onClose={() => setChange(null)} />}
      {waitingFor && <WaitingDialog plan={waitingFor} onClose={() => setWaitingFor(null)} />}
    </>
  );
}

/** Loads Paddle.js once checkout is configured; reports a completed checkout. */
function usePaddle(checkout: CheckoutConfig | null, onCompleted: (plan: PaidPlan) => void) {
  const [paddle, setPaddle] = useState<Paddle | null>(null);
  const completed = useRef(onCompleted);
  useEffect(() => {
    completed.current = onCompleted;
  });
  useEffect(() => {
    if (!checkout) return;
    let cancelled = false;
    void initializePaddle({
      environment: checkout.environment,
      token: checkout.clientToken,
      eventCallback: (event) => {
        if (event.name !== "checkout.completed") return;
        const plan = (event.data?.custom_data as { plan?: string } | null | undefined)?.plan;
        window.Paddle?.Checkout.close();
        completed.current(plan === "pro" ? "pro" : "creator");
      },
    }).then((instance) => {
      if (!cancelled && instance) setPaddle(instance);
    });
    return () => {
      cancelled = true;
    };
  }, [checkout]);
  return paddle;
}

function PlanOption({
  plan,
  current,
  interval,
  sameInterval,
  available,
  onChoose,
}: {
  plan: Plan;
  current: Plan;
  interval: Interval;
  sameInterval: boolean;
  available: boolean;
  onChoose: (plan: PaidPlan) => void;
}) {
  const isCurrent = plan.key === current.key && sameInterval;
  const upgrade = plan.monthlyMinutes > current.monthlyMinutes || (plan.key === current.key && interval === "year");
  const price = interval === "year" && plan.yearlyUsd > 0 ? plan.yearlyUsd / 12 : plan.monthlyUsd;
  return (
    <article
      aria-label={plan.name}
      className={`flex flex-col gap-4 rounded-[16px] bg-panel-1 p-6 ${plan.key === current.key ? "border-[1.5px] border-text" : "border border-line"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[20px] font-bold tracking-[-0.02em]">{plan.name}</span>
        {plan.key === current.key && (
          <span className="rounded-full bg-text px-2 py-0.5 font-mono text-[10.5px] font-semibold text-ink">YOUR PLAN</span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="flex items-baseline gap-1">
          <span className="text-[40px] leading-none font-bold tracking-[-0.05em]">${price}</span>
          <span className="text-[14px] text-muted">/ month</span>
        </span>
        <span className="font-mono text-[11.5px] text-muted">
          {plan.yearlyUsd === 0 ? "no card needed" : interval === "year" ? `billed $${plan.yearlyUsd} once a year` : "billed monthly"}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5 text-[13.5px] text-muted">
        <li>
          <span className="text-text">{plan.monthlyMinutes} min</span> · per month
        </li>
        <li>
          <span className="text-text">up to {plan.maxVideoMs / 60_000} min</span> · per video
        </li>
        <li>
          <span className="text-text">{plan.maxResolution}p</span> · exports
        </li>
        <li>
          <span className="text-text">{plan.simultaneousExports}</span> · {plan.simultaneousExports === 1 ? "export" : "exports"} at a time
        </li>
      </ul>
      {isCurrent || plan.key === "free" ? (
        <span className="mt-auto rounded-[9px] border border-dashed border-line-button px-3.5 py-2 text-center text-[13.5px] font-semibold text-muted">
          {isCurrent ? "Current plan" : "Cancel a paid plan to move here"}
        </span>
      ) : (
        <button
          type="button"
          disabled={!available}
          title={available ? undefined : "Checkout isn't available right now"}
          onClick={() => onChoose(plan.key as PaidPlan)}
          className={`mt-auto ${upgrade ? smallCreamButton : outlineButton}`}
        >
          {upgrade ? `Switch to ${plan.name}` : `Move to ${plan.name}`}
        </button>
      )}
    </article>
  );
}

const money = (amount: string, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount) / 100);

/** Change-plan modal for subscribers (handoff): review → done. */
function ChangeDialog({ plan, interval, onClose }: { plan: PaidPlan; interval: Interval; onClose: () => void }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewPlanChangeAction>> | null>(null);
  const [stage, setStage] = useState<"review" | "working" | "done">("review");
  const [result, setResult] = useState<{ scheduled: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void previewPlanChangeAction(plan, interval).then(setPreview);
  }, [plan, interval]);

  async function confirm() {
    setStage("working");
    const outcome = await changePlanAction(plan, interval);
    if (!outcome.ok) {
      setError(outcome.error);
      setStage("review");
      return;
    }
    setResult({ scheduled: outcome.scheduled });
    setStage("done");
    router.refresh();
  }

  const name = PLANS[plan].name;
  return (
    <Modal title={stage === "done" ? (result?.scheduled ? "Scheduled." : `You're on ${name}.`) : `Switch to ${name}`} onClose={onClose}>
      {stage === "done" ? (
        <p className="text-[14px] text-muted">
          {result?.scheduled
            ? `You keep your current plan until the end of this period, then move to ${name}.`
            : `${name} is active now, with its minutes and limits.`}
        </p>
      ) : !preview ? (
        <p className="text-[14px] text-muted">Checking the price with Paddle…</p>
      ) : !preview.ok ? (
        <p role="alert" className="text-[14px] text-danger-text">{preview.error}</p>
      ) : preview.kind === "upgrade" ? (
        <p className="text-[14px] text-muted">
          {name} starts now.{" "}
          {preview.amount && preview.currency
            ? `You'll be charged ${money(preview.amount, preview.currency)} today for the rest of this period.`
            : "You'll be charged the difference for the rest of this period."}
        </p>
      ) : (
        <p className="text-[14px] text-muted">
          You keep your current plan until this period ends. From then on you&apos;re billed for {name}.
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-danger-text">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={outlineButton}>
          {stage === "done" ? "Close" : "Cancel"}
        </button>
        {stage !== "done" && (
          <button type="button" onClick={confirm} disabled={stage === "working" || !preview?.ok} className={accentButton}>
            {stage === "working" ? "Confirming…" : "Confirm"}
          </button>
        )}
      </div>
    </Modal>
  );
}

/** After checkout: the plan changes only when Paddle's webhook confirms the payment. */
function WaitingDialog({ plan, onClose }: { plan: PaidPlan; onClose: () => void }) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(async () => {
      const current = await currentPlanAction();
      if (current?.planKey === plan) {
        window.clearInterval(timer);
        setConfirmed(true);
        router.refresh();
      } else if (Date.now() - started > 60_000) {
        setSlow(true);
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [plan, router]);

  return (
    <Modal title={confirmed ? `You're on ${PLANS[plan].name}.` : "Payment sent"} onClose={onClose}>
      <p className="text-[14px] text-muted" role="status">
        {confirmed
          ? "Your new minutes and limits are active."
          : slow
            ? "Paddle hasn't confirmed yet. You can close this — your plan updates as soon as it does."
            : "Waiting for confirmation from Paddle…"}
      </p>
      <div className="flex justify-end">
        <button type="button" onClick={onClose} className={confirmed ? smallCreamButton : outlineButton}>
          Close
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-[rgba(8,7,6,.62)] p-4 backdrop-blur-[6px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="flex w-[min(440px,100%)] flex-col gap-4 rounded-[18px] border border-line bg-panel-1 p-[26px]"
      >
        <h2 id="plan-dialog-title" className="text-[24px] font-bold tracking-[-0.03em]">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
