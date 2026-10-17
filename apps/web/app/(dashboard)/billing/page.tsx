import type { Metadata } from "next";
import { Suspense } from "react";
import {
  NEAR_LIMIT_SHARE,
  PLAN_KEYS,
  PLANS,
  usageMinutes,
  type Plan,
  type UsageSummary,
} from "@fala/shared";
import { getUsage, recentUsage, type UsageActivity } from "@/lib/billing";
import { requireUser } from "@/lib/dal";
import { formatExportDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Plan & usage" };

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dayAndYear = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const DAY_MS = 86_400_000;

/** Plan & usage (handoff §5): the period's minutes, the plan's limits, the plans and recent usage. */
export default function BillingPage() {
  return (
    <main className="mx-auto max-w-[1120px] px-8 pt-11 pb-20">
      <Suspense fallback={<h1 className="text-[52px] leading-none font-bold tracking-[-0.045em]">Plan &amp; usage</h1>}>
        <Billing />
      </Suspense>
    </main>
  );
}

async function Billing() {
  const user = await requireUser();
  const [usage, activity] = await Promise.all([getUsage(user.id), recentUsage(user.id)]);
  const used = usage.confirmedSeconds + usage.reservedSeconds;
  const renews = day.format(new Date(usage.periodEnd));
  const lastDay = new Date(new Date(usage.periodEnd).getTime() - DAY_MS);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-[52px] leading-none font-bold tracking-[-0.045em]">Plan &amp; usage</h1>
        <span className="font-mono text-xs text-muted uppercase">
          Period {day.format(new Date(usage.periodStart))} — {dayAndYear.format(lastDay)}
        </span>
      </div>

      {used / usage.limitSeconds > NEAR_LIMIT_SHARE && (
        <p role="status" className="flex items-start gap-3 rounded-[12px] border border-warning/40 bg-warning/10 px-4 py-3 text-[14px] text-text">
          <span aria-hidden className="text-warning">
            ◆
          </span>
          {usage.remainingSeconds === 0
            ? `You've used this period's ${usage.plan.monthlyMinutes} minutes. New videos can be captioned again on ${renews}, or right away on a bigger plan.`
            : `You've used ${usageMinutes(used)} of ${usage.plan.monthlyMinutes} minutes. They renew on ${renews}.`}
        </p>
      )}

      <div className="grid gap-5 min-[860px]:grid-cols-2">
        <UsageCard usage={usage} renews={renews} />
        <PlanCard plan={usage.plan} renews={renews} />
      </div>

      <section aria-labelledby="plans-title" className="flex flex-col gap-4">
        <h2 id="plans-title" className="font-mono text-[11.5px] tracking-[0.08em] text-muted">
          PLANS
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
          {PLAN_KEYS.map((key) => (
            <PlanOption key={key} plan={PLANS[key]} current={usage.plan} />
          ))}
        </div>
      </section>

      <Activity entries={activity} />
    </div>
  );
}

const card = "flex flex-col gap-5 rounded-[16px] border border-line bg-panel-1 p-[26px]";

function UsageCard({ usage, renews }: { usage: UsageSummary; renews: string }) {
  const percent = (seconds: number) => `${Math.min(100, (seconds / usage.limitSeconds) * 100)}%`;
  return (
    <section className={card} aria-label="Minutes this period">
      <span className="font-mono text-[11.5px] tracking-[0.08em] text-muted">MINUTES THIS MONTH</span>
      <span className="flex items-baseline gap-3">
        <span className="text-[88px] leading-none font-bold tracking-[-0.06em] tabular-nums">{usageMinutes(usage.confirmedSeconds)}</span>
        <span className="text-[19px] text-muted">of {usage.plan.monthlyMinutes} min</span>
      </span>
      <div className="flex flex-col gap-2.5">
        <div
          className="flex h-2 overflow-hidden rounded-full bg-[rgba(236,230,218,.12)]"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={usage.limitSeconds}
          aria-valuenow={usage.confirmedSeconds + usage.reservedSeconds}
          aria-label="Minutes used"
        >
          <span className="h-full bg-text" style={{ width: percent(usage.confirmedSeconds) }} />
          <span
            className="h-full bg-[repeating-linear-gradient(45deg,var(--color-accent)_0_2px,transparent_2px_4px)]"
            style={{ width: percent(usage.reservedSeconds) }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11.5px] text-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-[2px] bg-text" /> used
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-[2px] bg-[repeating-linear-gradient(45deg,var(--color-accent)_0_2px,transparent_2px_4px)]" />
            reserved for captions in progress
          </span>
          <span className="ml-auto">renews {renews}</span>
        </div>
      </div>
    </section>
  );
}

function planFacts(plan: Plan) {
  return [
    ["Minutes per month", `${plan.monthlyMinutes} min`],
    ["Length per video", `up to ${plan.maxVideoMs / 60_000} min`],
    ["Resolution", `${plan.maxResolution}p`],
    ["Simultaneous exports", String(plan.simultaneousExports)],
  ] as const;
}

function PlanCard({ plan, renews }: { plan: Plan; renews: string }) {
  return (
    <section className={card} aria-label="Your plan">
      <div className="flex items-center justify-between gap-3 font-mono text-[11.5px] text-muted">
        <span className="tracking-[0.08em]">YOUR PLAN</span>
        <span>active · renews {renews}</span>
      </div>
      <span className="text-[36px] leading-none font-bold tracking-[-0.04em]">{plan.name}</span>
      <dl className="flex flex-col">
        {planFacts(plan).map(([label, value]) => (
          <div key={label} className="flex items-center justify-between border-b border-line py-2.5 text-[14px]">
            <dt className="text-muted">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        disabled
        title="Available soon"
        className="self-start rounded-[9px] border border-line-button px-3.5 py-2 text-[13.5px] font-semibold text-text disabled:cursor-not-allowed disabled:opacity-50"
      >
        Payment &amp; invoices
      </button>
    </section>
  );
}

function PlanOption({ plan, current }: { plan: Plan; current: Plan }) {
  const isCurrent = plan.key === current.key;
  const upgrade = plan.monthlyMinutes > current.monthlyMinutes;
  return (
    <article
      aria-label={plan.name}
      className={`flex flex-col gap-4 rounded-[16px] bg-panel-1 p-6 ${isCurrent ? "border-[1.5px] border-text" : "border border-line"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[20px] font-bold tracking-[-0.02em]">{plan.name}</span>
        {isCurrent && <span className="rounded-full bg-text px-2 py-0.5 font-mono text-[10.5px] font-semibold text-ink">YOUR PLAN</span>}
      </div>
      <div className="flex flex-col gap-1">
        <span className="flex items-baseline gap-1">
          <span className="text-[40px] leading-none font-bold tracking-[-0.05em]">${plan.monthlyUsd}</span>
          <span className="text-[14px] text-muted">/ month</span>
        </span>
        <span className="font-mono text-[11.5px] text-muted">
          {plan.yearlyUsd > 0 ? `or $${plan.yearlyUsd} / year — $${plan.yearlyUsd / 12} a month` : "no card needed"}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5 text-[13.5px] text-muted">
        {planFacts(plan).map(([label, value]) => (
          <li key={label}>
            <span className="text-text">{value}</span> · {label.toLowerCase()}
          </li>
        ))}
      </ul>
      {isCurrent ? (
        <span className="mt-auto rounded-[9px] border border-dashed border-line-button px-3.5 py-2 text-center text-[13.5px] font-semibold text-muted">
          Current plan
        </span>
      ) : (
        <button
          type="button"
          disabled
          title="Checkout arrives soon"
          className={`mt-auto rounded-[9px] px-3.5 py-2 text-[13.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
            upgrade ? "bg-text text-ink" : "border border-line-button text-text"
          }`}
        >
          {upgrade ? `Switch to ${plan.name}` : `Move to ${plan.name}`}
        </button>
      )}
    </article>
  );
}

const STATUS = {
  RESERVED: { glyph: "◐", label: "reserved", className: "text-accent" },
  CONFIRMED: { glyph: "✓", label: "confirmed", className: "text-text" },
  RELEASED: { glyph: "↺", label: "released", className: "text-muted" },
} as const;

function Activity({ entries }: { entries: UsageActivity[] }) {
  return (
    <section aria-labelledby="activity-title" className="flex flex-col gap-3">
      <h2 id="activity-title" className="font-mono text-[11.5px] tracking-[0.08em] text-muted">
        RECENT ACTIVITY
      </h2>
      {entries.length === 0 ? (
        <p className="text-[14px] text-muted">Nothing yet. Minutes are counted when a video is transcribed.</p>
      ) : (
        <ul className="flex flex-col">
          {entries.map((entry) => {
            const status = STATUS[entry.status];
            return (
              <li key={entry.id} className="flex items-center gap-4 border-b border-line py-3 text-[14px]" data-testid="usage-row">
                <span className="min-w-0 flex-1 truncate font-semibold">{entry.projectName}</span>
                <span className="hidden font-mono text-[11.5px] text-muted min-[600px]:inline">
                  {entry.kind} · {formatExportDate(new Date(entry.createdAt))}
                </span>
                <span className={`rounded-full border border-line-strong px-2 py-0.5 font-mono text-[11px] ${status.className}`}>
                  <span aria-hidden>{status.glyph}</span> {status.label}
                </span>
                <span className={`w-16 text-right font-mono tabular-nums ${entry.status === "RELEASED" ? "text-muted line-through" : ""}`}>
                  {usageMinutes(entry.seconds)} min
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
