import { NEAR_LIMIT_SHARE, usageMinutes } from "@fala/shared";
import Link from "next/link";
import { getUsage } from "@/lib/billing";
import { requireUser } from "@/lib/dal";

const monthName = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });

/** Header usage mini-meter and plan pill (handoff §2): "OCTOBER · 38 of 120 min". */
export async function UsageMeter() {
  const user = await requireUser();
  const usage = await getUsage(user.id);
  const used = usage.confirmedSeconds + usage.reservedSeconds;
  const share = Math.min(1, used / usage.limitSeconds);
  return (
    <Link href="/billing" className="flex items-center gap-3" aria-label={`${usageMinutes(used)} of ${usage.plan.monthlyMinutes} minutes used. ${usage.plan.name} plan`}>
      <span className="hidden flex-col gap-1.5 min-[720px]:flex">
        <span className="font-mono text-[11px] whitespace-nowrap text-muted">
          {monthName.format(new Date(usage.periodStart)).toUpperCase()} ·{" "}
          <span className="text-text">
            {usageMinutes(used)} of {usage.plan.monthlyMinutes} min
          </span>
        </span>
        <span className="h-[3px] w-[140px] overflow-hidden rounded-full bg-[rgba(236,230,218,.14)]">
          <span
            className={`block h-full rounded-full ${share > NEAR_LIMIT_SHARE ? "bg-warning" : "bg-text"}`}
            style={{ width: `${share * 100}%` }}
          />
        </span>
      </span>
      <span className="rounded-full border border-line-button px-2.5 py-1 text-[12.5px] font-semibold text-text">{usage.plan.name}</span>
    </Link>
  );
}
