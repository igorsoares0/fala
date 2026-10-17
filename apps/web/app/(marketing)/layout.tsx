import Link from "next/link";
import { Suspense } from "react";
import { Wordmark } from "@/components/wordmark";
import { getCurrentUser } from "@/lib/dal";

/** The public website: landing, pricing and policies. */
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-[1120px] items-center gap-6 px-6 py-5 min-[720px]:px-8">
        <Wordmark href="/" />
        <nav className="flex gap-1 text-sm">
          <Link href="/#how" className="rounded-lg px-3 py-1.5 font-medium text-muted hover:text-text">
            How it works
          </Link>
          <Link href="/#pricing" className="rounded-lg px-3 py-1.5 font-medium text-muted hover:text-text">
            Pricing
          </Link>
        </nav>
        <div className="flex-1" />
        <Suspense fallback={<SignInLink />}>
          <AccountLink />
        </Suspense>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-8 text-[13px] text-muted min-[720px]:px-8">
          <span className="font-semibold text-text">
            fala<span className="text-accent">.</span>
          </span>
          <Link href="/terms" className="hover:text-text">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-text">
            Privacy
          </Link>
          <Link href="/refunds" className="hover:text-text">
            Refunds
          </Link>
          <span className="ml-auto">Payments are processed by Paddle, our reseller.</span>
        </div>
      </footer>
    </div>
  );
}

async function AccountLink() {
  const user = await getCurrentUser();
  return user ? (
    <Link href="/projects" className="rounded-[9px] bg-text px-4 py-2 text-[13.5px] font-semibold text-ink hover:bg-white">
      Open app
    </Link>
  ) : (
    <SignInLink />
  );
}

function SignInLink() {
  return (
    <Link href="/sign-in" className="rounded-[9px] bg-text px-4 py-2 text-[13.5px] font-semibold text-ink hover:bg-white">
      Sign in
    </Link>
  );
}
