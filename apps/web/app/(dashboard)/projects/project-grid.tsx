"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProjectAction } from "@/lib/project-actions";
import type { ProjectSummary } from "@/lib/projects";
import { DropZoneTile } from "./drop-zone-tile";
import { ProjectCard } from "./project-card";

/** Date labels are computed on the server so server and client render identical text. */
export type ProjectCardData = ProjectSummary & { dateLabel: string };

export function ProjectGrid({ projects }: { projects: ProjectCardData[] }) {
  const router = useRouter();
  const [creating, startCreating] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onFile(file: File) {
    setError(null);
    startCreating(async () => {
      const result = await createProjectAction(file.name);
      if (result.ok) router.push(`/projects/${result.data.id}`);
      else setError(result.error);
    });
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-4 text-[13px] text-danger-text">
          {error}
        </p>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-5 gap-y-7">
        <DropZoneTile onFile={onFile} busy={creating} />
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </>
  );
}
