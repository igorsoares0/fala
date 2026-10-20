/**
 * Who runs Supertitle, for the Terms, Privacy and Refund pages. Fill these in before
 * applying to Paddle: production refuses to start while a placeholder is left.
 */
export const LEGAL = {
  /** Person or company operating Supertitle. */
  operator: "[OPERATOR NAME]",
  /** Country whose law governs the Terms. */
  country: "Brazil",
  supportEmail: "support@usesupertitle.com",
  /** Date the current versions of the policies took effect. */
  effectiveDate: "October 20, 2026",
} as const;

export function legalPlaceholders(): string[] {
  return Object.entries(LEGAL)
    .filter(([, value]) => /^\[.*\]$/.test(value))
    .map(([key]) => key);
}
