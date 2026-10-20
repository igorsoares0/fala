import type { EmailData, EmailTemplate } from "@fala/shared";

/**
 * Email copy (spec FR-15). Plain text first, with a simple HTML version. Links point
 * into the app (sign-in required) — never to a file: downloads are always signed,
 * short-lived URLs created on demand.
 */

export type RenderedEmail = { subject: string; text: string; html: string };

type Content = {
  subject: string;
  /** Paragraphs. */
  body: string[];
  action?: { label: string; url: string };
  /** Why this email was sent (and how to stop optional ones). */
  footer: string;
};

const ACCOUNT_FOOTER = "You're receiving this because of activity on your Supertitle account.";

/** Builds the email for `template`. Missing data shows as an empty string, never "undefined". */
export function renderEmail(template: EmailTemplate, data: EmailData, appUrl: string): RenderedEmail {
  const value = (key: string) => (data[key] === undefined ? "" : String(data[key]));
  const app = (path: string) => `${appUrl}${path}`;
  const name = value("name") ? `Hi ${value("name")},` : "Hi,";

  const content: Record<EmailTemplate, () => Content> = {
    "reset-password": () => ({
      subject: "Your Supertitle sign-in link",
      body: [name, "Use this link to choose a new password and sign in. It expires in 30 minutes.", "If you didn't ask for it, ignore this email: your password stays the same."],
      action: { label: "Choose a password", url: value("url") },
      footer: ACCOUNT_FOOTER,
    }),
    // Sent to addresses nobody has confirmed yet: no user-supplied text (such as the name) goes in.
    "confirm-email": () => ({
      subject: "Confirm your email for Supertitle",
      body: ["Hi,", "Confirm this address to start uploading videos to your new Supertitle account."],
      action: { label: "Confirm email", url: value("url") },
      footer: "You're receiving this because this address was used to create a Supertitle account. If it wasn't you, ignore it.",
    }),
    "verify-email": () => ({
      subject: "Confirm your new email for Supertitle",
      body: ["Hi,", "Confirm this address to use it for your Supertitle account. Until you do, your current email stays active."],
      action: { label: "Confirm email", url: value("url") },
      footer: "You're receiving this because someone asked to use this address for a Supertitle account. If it wasn't you, ignore it.",
    }),
    welcome: () => ({
      subject: "Welcome to Supertitle",
      body: [
        name,
        "Drop a video, review the captions, pick a style and export. That's all there is to it.",
        `Your Free plan includes ${value("minutes")} minutes a month.`,
      ],
      action: { label: "Open Supertitle", url: app("/projects") },
      footer: ACCOUNT_FOOTER,
    }),
    "export-ready": () => ({
      subject: `"${value("projectName")}" is ready`,
      body: [name, `Your ${value("resolution")}p export of "${value("projectName")}" finished rendering. It's in the project, ready to download.`],
      action: { label: "Open the project", url: app(`/projects/${value("projectId")}`) },
      footer: "You're receiving this because export emails are on. Turn them off in Account → Preferences.",
    }),
    "usage-near-limit": () => ({
      subject: "You've used most of this month's minutes",
      body: [
        name,
        `You've used ${value("used")} of your ${value("limit")} minutes on the ${value("plan")} plan. They renew on ${value("renews")}.`,
        "Need more before then? A bigger plan gives you more minutes right away.",
      ],
      action: { label: "See plans", url: app("/billing") },
      footer: ACCOUNT_FOOTER,
    }),
    "subscription-started": () => ({
      subject: `You're on Supertitle ${value("plan")}`,
      body: [name, `Thanks for subscribing. ${value("plan")} is active: ${value("minutes")} minutes a month, videos up to ${value("maxMinutes")} minutes.`],
      action: { label: "Plan & usage", url: app("/billing") },
      footer: ACCOUNT_FOOTER,
    }),
    "subscription-changed": () => ({
      subject: `Your plan is now ${value("plan")}`,
      body: [name, `Your Supertitle plan changed to ${value("plan")}: ${value("minutes")} minutes a month.`],
      action: { label: "Plan & usage", url: app("/billing") },
      footer: ACCOUNT_FOOTER,
    }),
    "subscription-canceled": () => ({
      subject: "Your Supertitle plan was canceled",
      body: [name, `Your ${value("plan")} plan ends on ${value("endsOn")}. After that you're on Free; your projects stay.`],
      action: { label: "Plan & usage", url: app("/billing") },
      footer: ACCOUNT_FOOTER,
    }),
    "payment-failed": () => ({
      subject: "Your Supertitle payment didn't go through",
      body: [name, "We couldn't charge your card for your Supertitle plan. Your plan stays active while we try again — update your card to keep it."],
      action: { label: "Update payment", url: app("/billing") },
      footer: ACCOUNT_FOOTER,
    }),
    "source-expiring": () => ({
      subject: `The video of "${value("projectName")}" will be removed soon`,
      body: [
        name,
        `"${value("projectName")}" hasn't been opened for a while, so its original video will be removed on ${value("removeOn")}. The captions stay.`,
        "Open the project before then to keep it — that resets the clock.",
      ],
      action: { label: "Open the project", url: app(`/projects/${value("projectId")}`) },
      footer: "Supertitle keeps original videos while you work on them, and removes them after 90 days without activity.",
    }),
    "account-deleted": () => ({
      subject: "Your Supertitle account was deleted",
      body: [name, "Your account, projects and subscription are gone. Stored files are removed within 7 days.", "Thanks for using Supertitle."],
      footer: "You're receiving this because this address belonged to a Supertitle account.",
    }),
  };

  return toEmail(content[template]());
}

const escape = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function toEmail({ subject, body, action, footer }: Content): RenderedEmail {
  const text = [...body, ...(action ? [`${action.label}: ${action.url}`] : []), "—", footer].join("\n\n");
  const paragraphs = body.map((paragraph) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#12110f">${escape(paragraph)}</p>`).join("");
  const button = action
    ? `<p style="margin:24px 0"><a href="${escape(action.url)}" style="display:inline-block;background:#ff5a1f;color:#12110f;font-weight:700;font-size:15px;text-decoration:none;padding:12px 20px;border-radius:10px">${escape(action.label)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f4efe6;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<p style="margin:0 0 28px;font-size:22px;font-weight:800;letter-spacing:-0.03em;color:#12110f">fala<span style="color:#ff5a1f">.</span></p>
${paragraphs}${button}
<p style="margin:32px 0 0;font-size:12px;line-height:1.5;color:#6b665d">${escape(footer)}</p>
</div></body></html>`;
  return { subject, text, html };
}
