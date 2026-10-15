import type { Metadata } from "next";
import { PRESETS } from "@fala/shared";
import { CaptionSample } from "@/components/caption-sample";
import { Wordmark } from "@/components/wordmark";
import { isGoogleSignInEnabled } from "@/lib/auth-config";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

const DEMO_WORDS = ["It's", "the", "rhythm"];

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-wrap">
      <div className="flex min-h-screen flex-[1_1_440px] flex-col px-10 pt-7 pb-8">
        <Wordmark href="/sign-in" />
        <div className="flex flex-1 items-center justify-center py-10">
          <SignInForm googleEnabled={isGoogleSignInEnabled()} />
        </div>
        <span className="max-w-[380px] self-center text-center font-mono text-[11px] leading-[1.6] text-pretty text-muted">
          By continuing you accept the Terms and Privacy Policy. Audio sent for transcription is processed by an
          external provider.
        </span>
      </div>

      <div className="relative flex min-h-screen flex-[1_1_480px] items-center justify-center overflow-hidden border-l border-line bg-[radial-gradient(70%_60%_at_50%_45%,#211e1a,#12110f)] p-10">
        <div className="flex flex-col items-center gap-4">
          <div
            className="relative aspect-[9/16] w-[min(340px,calc((100vh-200px)*0.5625))] overflow-hidden rounded-2xl shadow-[0_40px_100px_-30px_rgba(0,0,0,.85),0_0_0_1px_rgba(236,230,218,.08)] [container-type:inline-size]"
            style={{
              background:
                "radial-gradient(45% 32% at 52% 58%,#7a5640 0%,rgba(122,86,64,0) 100%),radial-gradient(120% 80% at 25% 15%,#4a3526 0%,#1d1611 55%,#0d0b09 100%)",
            }}
          >
            <CaptionSample style={PRESETS.bold.style} words={DEMO_WORDS} activeIndex={2} />
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {Object.values(PRESETS).map((preset) => (
              <span
                key={preset.key}
                className={`rounded-full border px-2.5 py-1 font-mono text-[11px] ${
                  preset.key === "bold" ? "border-text text-text" : "border-line-strong text-muted"
                }`}
              >
                {preset.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
