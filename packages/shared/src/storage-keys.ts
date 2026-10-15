/**
 * Object key conventions (spec §8.1). Keys are built only from server-generated
 * ids — never from user-supplied file names.
 */

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function assertId(value: string, label: string) {
  if (!ID_PATTERN.test(value)) throw new Error(`Invalid ${label} for an object key.`);
}

export function projectPrefix(userId: string, projectId: string): string {
  assertId(userId, "userId");
  assertId(projectId, "projectId");
  return `users/${userId}/projects/${projectId}/`;
}

export function sourceKey(userId: string, projectId: string, uploadId: string, extension: string): string {
  assertId(uploadId, "uploadId");
  if (!/^[a-z0-9]{2,5}$/.test(extension)) throw new Error("Invalid extension for an object key.");
  return `${projectPrefix(userId, projectId)}source/${uploadId}.${extension}`;
}

/** One thumbnail per uploaded source, so retries of the same job overwrite instead of duplicating. */
export function thumbnailKey(userId: string, projectId: string, uploadId: string): string {
  assertId(uploadId, "uploadId");
  return `${projectPrefix(userId, projectId)}thumbnails/${uploadId}.jpg`;
}

export function uploadIdFromSourceKey(key: string): string | null {
  const match = /\/source\/([A-Za-z0-9_-]{1,64})\.[a-z0-9]{2,5}$/.exec(key);
  return match ? match[1] : null;
}

/** One file per export: a retry rewrites its own file, never an older version (spec §7.4). */
export function exportKey(userId: string, projectId: string, exportId: string): string {
  assertId(exportId, "exportId");
  return `${projectPrefix(userId, projectId)}exports/${exportId}.mp4`;
}
