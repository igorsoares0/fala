import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy explains what <strong>{LEGAL.operator}</strong> (&quot;we&quot;) collects when you use Supertitle and what we do with it.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Account details: name, email, and a password hash or your Google sign-in.</li>
        <li>Your content: the videos you upload, their transcripts and captions, styles and exports.</li>
        <li>Usage: minutes processed, plan and billing status, and technical logs (no video contents).</li>
      </ul>
      <h2>How we use it</h2>
      <p>To provide the service: transcribe, edit, render and store your projects; enforce plan limits; send account and service emails; prevent abuse. We don&apos;t sell your data or use your videos to train models.</p>
      <h2>Who processes it for us</h2>
      <ul>
        <li>
          <strong>AssemblyAI</strong> transcribes the audio of your videos. We delete the transcript and audio from their systems right after we
          receive the result.
        </li>
        <li>
          <strong>Paddle</strong> processes payments as our Merchant of Record and handles your billing details.
        </li>
        <li>
          <strong>Cloudflare R2</strong> stores videos and exports privately; <strong>Resend</strong> sends our emails; our database and servers run
          with our hosting providers.
        </li>
      </ul>
      <h2>How long we keep it</h2>
      <ul>
        <li>Exports: 30 days after they finish.</li>
        <li>Original videos: removed after 90 days without activity on the project (with an email a week before).</li>
        <li>Account data and projects: until you delete them or your account. Deleted accounts are removed right away; stored files within 7 days.</li>
      </ul>
      <h2>Your rights</h2>
      <p>
        You can see and edit your details in Account, export your files from the app, and delete your account at any time. For anything else —
        access, correction, or a copy of your data — write to {LEGAL.supportEmail}.
      </p>
      <h2>Cookies</h2>
      <p>We use only the cookies needed to keep you signed in. No advertising or tracking cookies.</p>
      <h2>Contact</h2>
      <p>{LEGAL.supportEmail}</p>
    </LegalPage>
  );
}
