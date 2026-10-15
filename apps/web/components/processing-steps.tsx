import type { ProcessingStage } from "@/lib/project-view";

const STAGES: ProcessingStage[] = ["upload", "validate", "transcribe"];

const LABELS = {
  short: ["File upload", "Validation", "Transcription"],
  long: ["File upload", "Validation", "Transcription and word timestamps"],
};

/** The three processing steps: filled when done, accent when active, hollow when pending. */
export function ProcessingSteps({ stage, variant = "short" }: { stage: ProcessingStage; variant?: "short" | "long" }) {
  const current = STAGES.indexOf(stage);
  return (
    <ol className="flex flex-col gap-2">
      {LABELS[variant].map((label, index) => {
        const state = index < current ? "done" : index === current ? "active" : "pending";
        return (
          <li key={label} className="flex items-center gap-2" aria-current={state === "active" ? "step" : undefined}>
            <span
              aria-hidden
              className={`size-2 flex-none rounded-full ${
                state === "done" ? "bg-text" : state === "active" ? "bg-accent" : "border border-[rgba(236,230,218,.35)]"
              }`}
            />
            <span className={state === "pending" ? "text-muted" : state === "active" ? "font-semibold text-text" : "text-text"}>
              {label}
              {state === "done" && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function ProgressBar({ percent, className = "" }: { percent: number; className?: string }) {
  return (
    <div className={`h-[3px] overflow-hidden rounded-sm bg-[rgba(236,230,218,.14)] ${className}`} aria-hidden>
      <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${percent}%` }} />
    </div>
  );
}
