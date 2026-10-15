"use client";

import { useState } from "react";
import { formatDuration, projectErrorFor } from "@fala/shared";
import { ChooseFileButton } from "@/components/choose-file-button";
import { ProcessingSteps, ProgressBar } from "@/components/processing-steps";
import { StatusPoller } from "@/components/status-poller";
import { smallCreamButton } from "@/components/ui";
import type { ProjectSummary } from "@/lib/projects";
import { needsPolling, projectView, type ProcessingStage } from "@/lib/project-view";
import { thumbnailSrc } from "@/lib/thumbnail";
import { retryUpload, useLocalUpload } from "@/lib/upload-store";

const PROCESSING_TITLES: Record<ProcessingStage, string> = {
  upload: "Uploading the video",
  validate: "Validating the file",
  transcribe: "Transcribing the audio",
};

/** Editor body for Phase 2: processing progress, problems, or the validated video. */
export function ProjectBody({ project }: { project: ProjectSummary }) {
  const local = useLocalUpload(project.id);
  const view = projectView(project.status, local);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="flex flex-1 items-center justify-center bg-[radial-gradient(70%_60%_at_50%_45%,#1d1b18,#12110f)] p-8">
      <StatusPoller active={needsPolling(project.status, local)} />
      <div className="flex w-full max-w-[440px] flex-col gap-4">
        {view.kind === "processing" && (
          <section className="flex flex-col gap-3.5 rounded-xl border border-line bg-panel-1 p-[18px]" aria-live="polite">
            <div className="flex items-baseline justify-between gap-3">
              <h1 className="text-base font-bold tracking-[-0.01em]">{PROCESSING_TITLES[view.stage]}</h1>
              <span className="font-mono text-xs font-medium tabular-nums">{view.percent}%</span>
            </div>
            <ProgressBar percent={view.percent} />
            <div className="text-[13px]">
              <ProcessingSteps stage={view.stage} variant="long" />
            </div>
            <p className="text-[13px] text-pretty text-muted">If you leave, processing continues.</p>
          </section>
        )}

        {(view.kind === "failed" || view.kind === "upload-failed" || view.kind === "interrupted") && (
          <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel-1 p-[18px]" role="alert">
            <span aria-hidden className="text-[22px] text-danger-text">
              ▲
            </span>
            <h1 className="text-base font-bold tracking-[-0.01em]">
              {view.kind === "failed"
                ? projectErrorFor(project.errorCode).title
                : view.kind === "upload-failed"
                  ? "The upload stopped"
                  : "Upload interrupted"}
            </h1>
            <p className="text-[13px] text-pretty text-muted">
              {view.kind === "failed"
                ? projectErrorFor(project.errorCode).body
                : view.kind === "upload-failed"
                  ? view.error
                  : "The page closed before the video finished sending. Choose the file again."}
            </p>
            <div className="flex gap-2">
              {view.kind === "upload-failed" ? (
                <button
                  type="button"
                  className={smallCreamButton}
                  onClick={() => {
                    if (!retryUpload(project.id)) setError("Choose the file again to retry.");
                  }}
                >
                  Try again
                </button>
              ) : (
                <ChooseFileButton projectId={project.id} className={smallCreamButton} onError={setError}>
                  {view.kind === "failed" ? "Upload another file" : "Choose the file"}
                </ChooseFileButton>
              )}
            </div>
          </section>
        )}

        {view.kind === "settled" && <ReadyVideo project={project} />}

        {error && (
          <p role="alert" className="text-[13px] text-danger-text">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}

function ReadyVideo({ project }: { project: ProjectSummary }) {
  const aspectRatio = project.width && project.height ? `${project.width} / ${project.height}` : "9 / 16";
  return (
    <section className="flex flex-col items-center gap-3">
      <div className="flex w-full items-center justify-between font-mono text-[11px] text-muted">
        <span className="truncate">
          YOUR VIDEO · {project.width}×{project.height}
        </span>
        {project.durationMs != null && <span className="tabular-nums">{formatDuration(project.durationMs)}</span>}
      </div>
      <div
        className="relative w-full overflow-hidden rounded-[14px] bg-panel-1 shadow-thumb"
        style={{ aspectRatio, width: `min(100%, calc((100vh - 260px) * ${project.width ?? 9} / ${project.height ?? 16}))` }}
      >
        {project.hasThumbnail && (
          // A signed redirect from the private bucket; next/image can't optimize it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailSrc(project)} alt="First frame of your video" className="size-full object-cover" />
        )}
      </div>
      <p className="text-center text-[13px] text-pretty text-muted">
        Your video is ready. Captions show up here once transcription is available.
      </p>
    </section>
  );
}
