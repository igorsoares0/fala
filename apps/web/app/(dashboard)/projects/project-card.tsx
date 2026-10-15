"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatDuration, projectErrorFor } from "@fala/shared";
import { ChooseFileButton } from "@/components/choose-file-button";
import { ProcessingSteps, ProgressBar } from "@/components/processing-steps";
import { StatusChip } from "@/components/status-chip";
import { thumbnailSrc } from "@/lib/thumbnail";
import { deleteProjectAction } from "@/lib/project-actions";
import { chipStatus, projectView, type ProjectView } from "@/lib/project-view";
import { cancelUpload, retryUpload, useLocalUpload } from "@/lib/upload-store";
import type { ProjectCardData } from "./project-grid";

/** Placeholder backgrounds for projects without a thumbnail yet. */
const THUMBNAIL_GRADIENTS = [
  "radial-gradient(45% 30% at 50% 55%,#7a5640,transparent),radial-gradient(120% 80% at 25% 15%,#4a3526,#1d1611 55%,#0d0b09)",
  "radial-gradient(50% 35% at 45% 50%,#3f5550,transparent),radial-gradient(120% 90% at 70% 10%,#24302d,#121615 60%,#0a0c0b)",
  "radial-gradient(40% 30% at 55% 45%,#6a6458,transparent),radial-gradient(120% 90% at 20% 20%,#3a3832,#171614 60%,#0b0b0a)",
  "radial-gradient(45% 32% at 50% 60%,#4b3b55,transparent),radial-gradient(120% 90% at 80% 15%,#2a2230,#141117 60%,#0b0a0c)",
  "radial-gradient(50% 30% at 50% 55%,#8a6a3a,transparent),radial-gradient(120% 90% at 30% 10%,#4d3a20,#1c150c 60%,#0d0a06)",
  "radial-gradient(45% 30% at 50% 50%,#55524c,transparent),radial-gradient(120% 90% at 50% 0%,#2e2c29,#151413 60%,#0b0b0a)",
];

function gradientFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return THUMBNAIL_GRADIENTS[hash % THUMBNAIL_GRADIENTS.length];
}

const overlayButton =
  "pointer-events-auto mt-1 self-start rounded-lg border border-[rgba(236,230,218,.25)] px-3 py-[7px] text-[12.5px] font-semibold text-text transition-colors hover:bg-text hover:text-ink";

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const local = useLocalUpload(project.id);
  const view = projectView(project.status, local);
  const [confirming, setConfirming] = useState(false);
  const [deleting, startDeleting] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirmDelete() {
    startDeleting(async () => {
      cancelUpload(project.id);
      const result = await deleteProjectAction(project.id);
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
      }
    });
  }

  return (
    <article className="flex min-w-0 flex-col gap-2.5" aria-label={project.name}>
      <div
        className="relative aspect-[9/16] overflow-hidden rounded-xl shadow-thumb [container-type:inline-size]"
        style={{ background: gradientFor(project.id) }}
      >
        <Link href={`/projects/${project.id}`} className="absolute inset-0" aria-label={`Open ${project.name}`}>
          {project.hasThumbnail && (
            // A signed redirect from the private bucket; next/image can't optimize it.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnailSrc(project)}
              alt=""
              className="absolute inset-0 size-full object-cover"
              data-testid="project-thumbnail"
            />
          )}
          <span className="absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_100%,rgba(0,0,0,.55),transparent_70%)]" />
          {/* A caption sample in the project's preset joins here once transcripts exist (Phase 3). */}
          {project.durationMs != null && (
            <span className="absolute bottom-2.5 left-2.5 rounded-[5px] bg-[rgba(18,17,15,.7)] px-[7px] py-[3px] font-mono text-[11px] font-medium text-text">
              {formatDuration(project.durationMs)}
            </span>
          )}
        </Link>

        <CardOverlay view={view} project={project} onError={setError} />

        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${project.name}`}
          className="absolute top-2 right-2 size-7 rounded-lg bg-[rgba(18,17,15,.55)] text-[15px] leading-none text-text opacity-75 transition hover:bg-ink hover:opacity-100"
        >
          ×
        </button>

        {confirming && (
          <div
            role="alertdialog"
            aria-label="Delete this project?"
            className="absolute inset-0 flex flex-col justify-center gap-3 bg-[rgba(18,17,15,.9)] p-[18px] text-center"
          >
            <span className="text-[15px] font-bold">Delete this project?</span>
            <span className="text-[12.5px] text-pretty text-muted">The video, captions and exports will be deleted.</span>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                autoFocus
                className="rounded-lg border border-line-button px-3 py-2 text-[12.5px] font-semibold text-text"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-lg bg-accent px-3 py-2 text-[12.5px] font-semibold text-ink disabled:opacity-70"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 px-0.5">
        <span className="text-[14.5px] leading-[1.3] font-semibold tracking-[-0.01em] text-pretty">{project.name}</span>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={chipStatus(project.status, view)} />
          <span className="font-mono text-[11px] text-muted">{project.dateLabel}</span>
        </div>
        {error && (
          <span role="alert" className="text-[12.5px] text-danger-text">
            {error}
          </span>
        )}
      </div>
    </article>
  );
}

/**
 * Progress or problem shown over the thumbnail. Clicks pass through to the
 * "open project" link except on the overlay's own button.
 */
function CardOverlay({
  view,
  project,
  onError,
}: {
  view: ProjectView;
  project: ProjectCardData;
  onError: (message: string | null) => void;
}) {
  if (view.kind === "processing") {
    return (
      <div
        className="pointer-events-none absolute inset-0 flex flex-col justify-end gap-3.5 bg-[rgba(18,17,15,.72)] px-4 py-[18px] backdrop-blur-[6px]"
        data-testid="processing-overlay"
      >
        <span className="text-[30px] font-bold tracking-[-0.04em] tabular-nums">{view.percent}%</span>
        <div className="text-[12.5px]">
          <ProcessingSteps stage={view.stage} />
        </div>
        <ProgressBar percent={view.percent} />
      </div>
    );
  }

  if (view.kind === "settled") return null;

  const copy =
    view.kind === "failed"
      ? projectErrorFor(project.errorCode)
      : view.kind === "upload-failed"
        ? { title: "The upload stopped", body: view.error }
        : { title: "Upload interrupted", body: "The page closed before the video finished sending. Choose the file again." };

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-end gap-2.5 bg-[rgba(18,17,15,.8)] px-4 py-[18px]">
      <span aria-hidden className="text-[22px] text-danger-text">
        ▲
      </span>
      <span className="text-[15px] font-bold tracking-[-0.01em]">{copy.title}</span>
      <span className="text-[12.5px] text-pretty text-muted">{copy.body}</span>
      {view.kind === "upload-failed" ? (
        <button
          type="button"
          className={overlayButton}
          onClick={() => {
            if (!retryUpload(project.id)) onError("Choose the file again to retry.");
          }}
        >
          Try again
        </button>
      ) : (
        <ChooseFileButton projectId={project.id} className={overlayButton} onError={onError}>
          {view.kind === "failed" ? "Upload another file" : "Choose the file"}
        </ChooseFileButton>
      )}
    </div>
  );
}
