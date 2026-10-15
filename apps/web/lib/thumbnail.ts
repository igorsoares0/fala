/** Ownership-checked thumbnail address; the version busts the browser cache when it changes. */
export function thumbnailSrc(project: { id: string; updatedAt: Date }) {
  return `/api/projects/${project.id}/thumbnail?v=${new Date(project.updatedAt).getTime()}`;
}
