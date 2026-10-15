import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { getProject } from "@/lib/projects";
import { getCaptionTrack } from "@/lib/transcription";
import { SaveIndicator } from "@/components/save-indicator";
import { thumbnailSrc } from "@/lib/thumbnail";
import { EditorShell } from "./editor/editor-shell";
import { EditorHeader } from "./editor-header";
import { ProjectBody } from "./project-body";
import { ProjectNameInput } from "./project-name-input";

export default function ProjectPage({ params }: PageProps<"/projects/[projectId]">) {
  return (
    <div className="flex h-screen flex-col">
      <Suspense fallback={<EditorHeader />}>
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
  const captions = project.status === "READY" ? await getCaptionTrack(user.id, project.id) : null;

  if (captions && project.durationMs) {
    return (
      <EditorShell
        projectId={project.id}
        name={project.name}
        durationMs={project.durationMs}
        track={captions.track}
        version={captions.version}
        style={project.style}
        width={project.width}
        height={project.height}
        posterSrc={thumbnailSrc(project)}
      />
    );
  }

  return (
    <>
      <EditorHeader>
        <ProjectNameInput projectId={project.id} initialName={project.name} />
        <SaveIndicator />
      </EditorHeader>
      <ProjectBody project={project} />
    </>
  );
}
