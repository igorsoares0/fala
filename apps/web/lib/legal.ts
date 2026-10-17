/**
 * Who runs Fala, for the Terms, Privacy and Refund pages. Fill these in before
 * applying to Paddle: production refuses to start while a placeholder is left.
 */
export const LEGAL = {
  /** Person or company operating Fala. */
  operator: "[OPERATOR NAME]",
  /** Country whose law governs the Terms. */
  country: "[COUNTRY]",
  supportEmail: "[SUPPORT EMAIL]",
  /** Date the current versions of the policies took effect. */
  effectiveDate: "[EFFECTIVE DATE]",
} as const;

export function legalPlaceholders(): string[] {
  return Object.entries(LEGAL)
    .filter(([, value]) => /^\[.*\]$/.test(value))
    .map(([key]) => key);
}
