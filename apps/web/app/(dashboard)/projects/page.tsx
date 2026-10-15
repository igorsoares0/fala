import type { Metadata } from "next";
import { Suspense, cache } from "react";
import { requireUser } from "@/lib/dal";
import { formatProjectDate } from "@/lib/dates";
import { listProjects } from "@/lib/projects";
import { ProjectGrid } from "./project-grid";

export const metadata: Metadata = { title: "Projects" };

/** One query per request, shared by the count and the grid. */
const getMyProjects = cache(async () => {
  const user = await requireUser();
  return listProjects(user.id);
});

export default function ProjectsPage() {
  return (
    <main className="mx-auto max-w-[1360px] px-8 pt-11 pb-20">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[52px] leading-none font-bold tracking-[-0.045em]">Projects</h1>
          <Suspense fallback={<span className="h-[15px]" />}>
            <ProjectCount />
          </Suspense>
        </div>
        <span className="max-w-[340px] text-sm text-pretty text-muted">
          Drop a video, review the text, pick a style. We handle the rest.
        </span>
      </div>
      <Suspense fallback={<GridSkeleton />}>
        <Projects />
      </Suspense>
    </main>
  );
}

async function ProjectCount() {
  const projects = await getMyProjects();
  const label = projects.length === 1 ? "1 video" : `${projects.length} videos`;
  return <span className="font-mono text-xs text-muted">{label}</span>;
}

async function Projects() {
  const projects = await getMyProjects();
  const now = new Date();
  return (
    <ProjectGrid
      projects={projects.map((project) => ({ ...project, dateLabel: formatProjectDate(project.createdAt, now) }))}
    />
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-5 gap-y-7">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="aspect-[9/16] animate-pulse rounded-xl bg-panel-1" />
      ))}
    </div>
  );
}
