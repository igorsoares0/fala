import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusChip } from "@/components/status-chip";
import { requireUser } from "@/lib/dal";
import { getProject } from "@/lib/projects";
import { ProjectNameInput } from "./project-name-input";

export default function ProjectPage({ params }: PageProps<"/projects/[projectId]">) {
  return (
    <div className="flex min-h-screen flex-col">
      <Suspense fallback={<EditorHeaderShell />}>
        <Editor params={params} />
      </Suspense>
    </div>
  );
}

async function Editor({ params }: { params: PageProps<"/projects/[projectId]">["params"] }) {
  const [{ projectId }, user] = await Promise.all([params, requireUser()]);
  const project = await getProject(user.id, projectId);
  // Missing and foreign projects look identical, so ids from other accounts reveal nothing.
  if (!project) notFound();

  return (
    <>
      <EditorHeaderShell>
        <ProjectNameInput projectId={project.id} initialName={project.name} />
      </EditorHeaderShell>
      <main className="flex flex-1 items-center justify-center bg-[radial-gradient(70%_60%_at_50%_45%,#1d1b18,#12110f)] p-8">
        <div className="flex max-w-[420px] flex-col items-center gap-4 text-center">
          <StatusChip status={project.status} />
          <h1 className="text-[22px] font-bold tracking-[-0.03em]">Upload is on its way</h1>
          <p className="text-sm text-pretty text-muted">
            This project was created from your file name. Sending the video, transcription and the caption editor
            arrive in the next milestones.
          </p>
        </div>
      </main>
    </>
  );
}

function EditorHeaderShell({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
      <Link
        href="/projects"
        className="rounded-lg px-2.5 py-1.5 text-[13.5px] font-semibold text-muted transition-colors hover:bg-panel-1 hover:text-text"
      >
        ← Projects
      </Link>
      <span className="h-5 w-px bg-line" aria-hidden />
      {children}
    </header>
  );
}
