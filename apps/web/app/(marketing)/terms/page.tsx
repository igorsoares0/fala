import type { Metadata } from "next";
import Link from "next/link";
import { PLANS } from "@fala/shared";
import { LEGAL } from "@/lib/legal";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms govern your use of Supertitle, a service operated by <strong>{LEGAL.operator}</strong> (&quot;we&quot;). By creating an account you
        agree to them.
      </p>
      <h2>The service</h2>
      <p>
        Supertitle transcribes the speech in videos you upload, lets you edit the captions and style, and renders a video file with the captions burned in.
        Transcription is automatic and can contain mistakes; you&apos;re responsible for reviewing captions before you publish them.
      </p>
      <h2>Your account</h2>
      <p>Keep your sign-in details safe. You must be old enough to agree to these terms where you live. One person or organization per account.</p>
      <h2>Your content</h2>
      <p>
        You keep all rights to the videos you upload and the files you export. You give us permission to store and process them only to provide the
        service. You confirm you have the rights to the content you upload, and that it doesn&apos;t break the law or anyone&apos;s rights.
      </p>
      <h2>Plans, payment and limits</h2>
      <p>
        Free and paid plans have the limits shown on the pricing page (for example, {PLANS.pro.monthlyMinutes} minutes a month on {PLANS.pro.name}).
        Paid plans renew automatically each month or year until you cancel. Our order process is conducted by our online reseller{" "}
        <strong>Paddle.com</strong>, the Merchant of Record for all our orders; Paddle handles payment, taxes, invoices and billing questions.
      </p>
      <h2>Cancellation and refunds</h2>
      <p>
        You can cancel anytime from Plan &amp; usage; your plan stays until the end of the period you paid for. See the{" "}
        <Link href="/refunds" className="underline">
          refund policy
        </Link>
        .
      </p>
      <h2>Acceptable use</h2>
      <p>Don&apos;t use Supertitle to break the law, to infringe others&apos; rights, to process content you&apos;re not allowed to, or to overload or attack the service.</p>
      <h2>Retention</h2>
      <p>
        Exported files are kept for 30 days. The original video of a project you haven&apos;t opened for 90 days is removed (we email you a week
        before); the project and its captions stay. See the{" "}
        <Link href="/privacy" className="underline">
          privacy policy
        </Link>
        .
      </p>
      <h2>Changes and termination</h2>
      <p>
        We may update these terms and will tell you about important changes by email or in the app. You can delete your account anytime; we may
        suspend accounts that break these terms.
      </p>
      <h2>Liability</h2>
      <p>
        The service is provided &quot;as is&quot;. To the extent the law allows, our total liability is limited to what you paid us in the 12 months
        before the claim. These terms are governed by the laws of {LEGAL.country}.
      </p>
      <h2>Contact</h2>
      <p>{LEGAL.supportEmail}</p>
    </LegalPage>
  );
}
