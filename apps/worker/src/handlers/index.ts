import type { JobPayload, JobType } from "@fala/shared";
import { deleteProjectAssets } from "./delete-project-assets";
import { deleteAccountAssets } from "./delete-account-assets";
import { renderExport } from "./render-export";
import { retentionSweep } from "./retention-sweep";
import { sendEmail } from "./send-email";
import type { JobHandler } from "./types";
import { transcribeVideo } from "./transcribe-video";
import { validateVideo } from "./validate-video";

export const handlers: { [T in JobType]: JobHandler<JobPayload<T>> } = {
  VALIDATE_VIDEO: validateVideo,
  TRANSCRIBE_VIDEO: transcribeVideo,
  RENDER_EXPORT: renderExport,
  DELETE_PROJECT_ASSETS: deleteProjectAssets,
  SEND_EMAIL: sendEmail,
  RETENTION_SWEEP: retentionSweep,
  DELETE_ACCOUNT_ASSETS: deleteAccountAssets,
};
