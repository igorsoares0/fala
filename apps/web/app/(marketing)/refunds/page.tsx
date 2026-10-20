import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Refund Policy" };

export default function RefundsPage() {
  return (
    <LegalPage title="Refund Policy">
      <p>
        Payments for Supertitle are processed by <strong>Paddle.com</strong>, our reseller and Merchant of Record. Refunds are issued by Paddle to your
        original payment method.
      </p>
      <h2>Refunds</h2>
      <p>
        If Supertitle doesn&apos;t work for you, ask for a refund within <strong>14 days</strong> of a payment and we&apos;ll refund it in full — for your
        first payment and for renewals. After 14 days, payments aren&apos;t refundable, but you can cancel anytime to stop future renewals.
      </p>
      <h2>Cancelling</h2>
      <p>Cancel from Plan &amp; usage. Your plan stays active until the end of the period you&apos;ve paid for; you won&apos;t be charged again.</p>
      <h2>How to ask</h2>
      <p>
        Write to {LEGAL.supportEmail} from your account&apos;s email, or reply to your Paddle receipt. Paddle&apos;s buyer terms also apply to your
        purchase.
      </p>
    </LegalPage>
  );
}
