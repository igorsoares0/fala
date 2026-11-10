import { SAFE_ZONE } from "@fala/shared";

const percent = (fraction: number) => `${fraction * 100}%`;

const zone =
  "absolute bg-[rgba(18,17,15,.3)] bg-[repeating-linear-gradient(135deg,rgba(236,230,218,.14)_0_2px,transparent_2px_9px)]";
const edge = "border-dashed border-[rgba(236,230,218,.55)]";

/**
 * Where TikTok, Reels and Shorts draw their own interface over a full-screen vertical
 * video: captions and faces are best kept out of the hatched areas. A guide for the
 * editor only — it's never part of the export.
 */
export function SafeZoneGuide() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" data-testid="safe-zones">
      <div className={`${zone} ${edge} inset-x-0 top-0 border-b`} style={{ height: percent(SAFE_ZONE.top) }} />
      <div
        className={`${zone} ${edge} right-0 border-l`}
        style={{ top: percent(SAFE_ZONE.top), bottom: percent(SAFE_ZONE.bottom), width: percent(SAFE_ZONE.right) }}
      />
      <div className={`${zone} ${edge} inset-x-0 bottom-0 border-t`} style={{ height: percent(SAFE_ZONE.bottom) }}>
        <span className="absolute right-[4%] bottom-[8%] font-mono text-[2.6cqw] tracking-[0.08em] text-[rgba(236,230,218,.75)] uppercase">
          App interface
        </span>
      </div>
    </div>
  );
}
