"use client";

import { useId, useLayoutEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { fieldLabel, primaryButton, textInput } from "@/components/ui";

type Mode = "signIn" | "signUp";
type Message = { kind: "error" | "info"; text: string; field?: "email" | "password" };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD_LENGTH = 8;

const COPY = {
  signIn: {
    title: "Welcome back",
    subtitle: "Your projects are right where you left them.",
    submit: "Sign in",
    switchQuestion: "New here?",
    switchCta: "Create account",
    passwordPlaceholder: "Your password",
  },
  signUp: {
    title: "Create your account",
    subtitle: "Your first 30 minutes of video each month are on us.",
    submit: "Create account",
    switchQuestion: "Already have an account?",
    switchCta: "Sign in",
    passwordPlaceholder: "At least 8 characters",
  },
} as const;

export function SignInForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const passwordId = useId();
  const copy = COPY[mode];

  // Next.js keeps visited routes alive (hidden) with React <Activity>. Start fresh every
  // time this form is hidden so a password or a stale "busy" state never survives navigation.
  useLayoutEffect(() => {
    return () => {
      setMode("signIn");
      setName("");
      setEmail("");
      setPassword("");
      setBusy(false);
      setMessage(null);
    };
  }, []);

  function clearMessageFor(field: Message["field"]) {
    if (message?.field === field) setMessage(null);
  }

  function validate(): Message | null {
    if (!EMAIL_PATTERN.test(email.trim())) {
      return { kind: "error", field: "email", text: "That email doesn't look complete. Check it and try again." };
    }
    if (mode === "signIn" && password.length === 0) {
      return { kind: "error", field: "password", text: "Enter your password." };
    }
    if (mode === "signUp" && password.length < MIN_PASSWORD_LENGTH) {
      return { kind: "error", field: "password", text: "Use at least 8 characters." };
    }
    return null;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setMessage(problem);
      return;
    }
    setBusy(true);
    setMessage(null);
    const trimmedEmail = email.trim();
    const { error } =
      mode === "signIn"
        ? await authClient.signIn.email({ email: trimmedEmail, password })
        : await authClient.signUp.email({
            email: trimmedEmail,
            password,
            name: name.trim() || trimmedEmail.split("@")[0],
          });
    if (error) {
      setBusy(false);
      setMessage({ kind: "error", text: describeAuthError(mode, error.status) });
      return;
    }
    router.replace("/projects");
    router.refresh();
  }

  async function onForgotPassword() {
    const trimmedEmail = email.trim();
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setMessage({ kind: "error", field: "email", text: "That email doesn't look complete. Check it and try again." });
      return;
    }
    // Always show the same neutral message so the form never reveals whether an account exists.
    await authClient.requestPasswordReset({ email: trimmedEmail, redirectTo: "/reset-password" });
    setMessage({
      kind: "info",
      text: `If there's an account for ${trimmedEmail}, we sent a sign-in link. It expires in 30 minutes.`,
    });
  }

  async function onGoogle() {
    await authClient.signIn.social({ provider: "google", callbackURL: "/projects" });
  }

  function switchMode() {
    setMode(mode === "signIn" ? "signUp" : "signIn");
    setMessage(null);
  }

  const emailInvalid = message?.field === "email";

  return (
    <form onSubmit={onSubmit} noValidate className="flex w-full max-w-[380px] flex-col gap-[22px]">
      <div className="flex flex-col gap-2.5">
        <h1 className="text-[40px] leading-[1.02] font-bold tracking-[-0.045em] text-balance">{copy.title}</h1>
        <span className="text-[15px] text-pretty text-muted">{copy.subtitle}</span>
      </div>

      <button
        type="button"
        onClick={onGoogle}
        disabled={!googleEnabled}
        title={googleEnabled ? undefined : "Google sign-in isn't configured in this environment"}
        className="flex items-center justify-center gap-2.5 rounded-[11px] border border-line-button bg-panel-1 px-4 py-[13px] text-[14.5px] font-semibold text-text transition-colors hover:border-[rgba(236,230,218,.35)] hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          aria-hidden
          className="grid size-[18px] place-items-center rounded-full bg-text text-[11px] font-extrabold text-ink"
        >
          G
        </span>
        Continue with Google
      </button>

      <div className="flex items-center gap-3 font-mono text-[11px] text-muted">
        <span className="h-px flex-1 bg-[rgba(236,230,218,.1)]" />
        or with email
        <span className="h-px flex-1 bg-[rgba(236,230,218,.1)]" />
      </div>

      <div className="flex flex-col gap-3.5">
        {mode === "signUp" && (
          <label className="flex flex-col gap-[7px]">
            <span className={fieldLabel}>Name</span>
            <input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="What should we call you"
              className={textInput}
            />
          </label>
        )}
        <label className="flex flex-col gap-[7px]">
          <span className={fieldLabel}>Email</span>
          <input
            name="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearMessageFor("email");
            }}
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={emailInvalid}
            className={`${textInput} ${emailInvalid ? "border-danger-text" : ""}`}
          />
        </label>
        {/* Not a wrapping <label>: the "Forgot password" button must not become part of the field's name. */}
        <div className="flex flex-col gap-[7px]">
          <span className="flex items-baseline justify-between">
            <label htmlFor={passwordId} className={fieldLabel}>
              Password
            </label>
            {mode === "signIn" && (
              <button
                type="button"
                onClick={onForgotPassword}
                className="text-[12.5px] whitespace-nowrap text-muted underline underline-offset-[3px] hover:text-text"
              >
                Forgot password
              </button>
            )}
          </span>
          <input
            id={passwordId}
            name="password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearMessageFor("password");
            }}
            autoComplete={mode === "signIn" ? "current-password" : "new-password"}
            placeholder={copy.passwordPlaceholder}
            className={textInput}
          />
        </div>
        {message && (
          <span
            role={message.kind === "error" ? "alert" : "status"}
            className={`text-[13px] leading-[1.45] ${message.kind === "error" ? "text-danger-text" : "text-text"}`}
          >
            {message.text}
          </span>
        )}
      </div>

      <button type="submit" disabled={busy} className={`${primaryButton} py-3.5 disabled:cursor-progress`}>
        {busy ? (mode === "signIn" ? "Signing in…" : "Creating account…") : copy.submit}
      </button>

      <span className="text-center text-sm text-muted">
        {copy.switchQuestion}{" "}
        <button
          type="button"
          onClick={switchMode}
          className="font-semibold text-text underline underline-offset-[3px]"
        >
          {copy.switchCta}
        </button>
      </span>
    </form>
  );
}

function describeAuthError(mode: Mode, status: number | undefined): string {
  if (status === 429) return "Too many attempts. Wait a minute and try again.";
  if (mode === "signIn") return "That email and password don't match. Check them and try again.";
  if (status === 422 || status === 400) return "We couldn't create that account. Try signing in instead.";
  return "Something went wrong on our side. Try again in a moment.";
}
