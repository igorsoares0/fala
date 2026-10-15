import type { JobPayload, JobType } from "@fala/shared";
import { deleteProjectAssets } from "./delete-project-assets";
import type { JobHandler } from "./types";
import { validateVideo } from "./validate-video";

export const handlers: { [T in JobType]: JobHandler<JobPayload<T>> } = {
  VALIDATE_VIDEO: validateVideo,
  DELETE_PROJECT_ASSETS: deleteProjectAssets,
};
