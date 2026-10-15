"use client";

import { useLayoutEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { fieldLabel, primaryButton, textInput } from "@/components/ui";

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const linkError = searchParams.get("error");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear the password when Next.js hides this route with <Activity>.
  useLayoutEffect(() => {
    return () => {
      setPassword("");
      setBusy(false);
      setError(null);
    };
  }, []);

  if (!token || linkError) {
    return (
      <div className="flex w-full max-w-[380px] flex-col gap-4">
        <h1 className="text-[40px] leading-[1.02] font-bold tracking-[-0.045em]">This link has expired</h1>
        <p className="text-[15px] text-muted">Sign-in links work once and expire after 30 minutes. Request a new one.</p>
        <Link href="/sign-in" className={primaryButton}>
          Back to sign in
        </Link>
      </div>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError("Use at least 8 characters.");
      return;
    }
    setBusy(true);
    const { error: resetError } = await authClient.resetPassword({ newPassword: password, token: token! });
    setBusy(false);
    if (resetError) {
      setError("This link has expired. Request a new one from the sign-in page.");
      return;
    }
    router.replace("/sign-in");
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex w-full max-w-[380px] flex-col gap-[22px]">
      <div className="flex flex-col gap-2.5">
        <h1 className="text-[40px] leading-[1.02] font-bold tracking-[-0.045em]">Choose a new password</h1>
        <span className="text-[15px] text-muted">You&apos;ll use it to sign in from now on.</span>
      </div>
      <label className="flex flex-col gap-[7px]">
        <span className={fieldLabel}>New password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className={textInput}
        />
      </label>
      {error && (
        <span role="alert" className="text-[13px] text-danger-text">
          {error}
        </span>
      )}
      <button type="submit" disabled={busy} className={`${primaryButton} py-3.5`}>
        {busy ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
