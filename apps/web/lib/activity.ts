/** Marks a project as in use: restarts the retention clock of its original video (spec FR-16). */
export const ACTIVE_NOW = () => ({ lastActiveAt: new Date(), sourceExpiryWarnedAt: null });
