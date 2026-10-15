import "server-only";

interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Transactional email entry point. Until Resend is wired in (Phase 6) messages
 * are written to the server log so auth flows can be exercised locally.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Email delivery is not configured yet.");
  }
  console.info(`[email] to=${message.to} subject="${message.subject}"\n${message.text}`);
}
