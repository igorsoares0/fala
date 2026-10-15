import type { Metadata } from "next";
import { Suspense } from "react";
import { Wordmark } from "@/components/wordmark";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col px-10 pt-7 pb-8">
      <Wordmark href="/sign-in" />
      <div className="flex flex-1 items-center justify-center py-10">
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
