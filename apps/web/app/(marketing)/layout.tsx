import Link from "next/link";
import { Suspense } from "react";
import { Wordmark } from "@/components/wordmark";
import { getCurrentUser } from "@/lib/dal";
import { footerHubs } from "@/lib/pseo/content";

/** The public website: landing, pricing, policies and the pSEO pages. */
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-[1120px] items-center gap-2 px-6 py-5 min-[520px]:gap-6 min-[720px]:px-8">
        <Wordmark href="/" />
        <nav className="flex gap-1 text-sm whitespace-nowrap">
          {/* On phones only Pricing fits next to the logo and the account button. */}
          <Link href="/#how" className="hidden rounded-lg px-3 py-1.5 font-medium text-muted hover:text-text min-[520px]:block">
            How it works
          </Link>
          <Link href="/#pricing" className="rounded-lg px-2 py-1.5 font-medium min-[520px]:px-3 text-muted hover:text-text">
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
            supertitle<span className="text-accent">.</span>
          </span>
          {footerHubs().map((hub) => (
            <Link key={hub.path} href={hub.path} className="hover:text-text">
              {hub.navLabel}
            </Link>
          ))}
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
    <Link href="/projects" className="shrink-0 rounded-[9px] bg-text px-3 py-2 text-[13.5px] min-[520px]:px-4 font-semibold whitespace-nowrap text-ink hover:bg-white">
      Open app
    </Link>
  ) : (
    <SignInLink />
  );
}

function SignInLink() {
  return (
    <Link href="/sign-in" className="shrink-0 rounded-[9px] bg-text px-3 py-2 text-[13.5px] min-[520px]:px-4 font-semibold whitespace-nowrap text-ink hover:bg-white">
      Sign in
    </Link>
  );
}
