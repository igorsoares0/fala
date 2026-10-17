import type { Metadata } from "next";
import Link from "next/link";
import { PLAN_KEYS, PLANS, PRESETS } from "@fala/shared";
import { CaptionDemo } from "./caption-demo";

export const metadata: Metadata = {
  title: { absolute: "Fala — captions for short videos, in minutes" },
  description: "Upload a video, review the text, pick a style, export an MP4 with burned-in captions. No timeline to learn.",
  openGraph: {
    title: "Fala — captions for short videos, in minutes",
    description: "Upload, review the text, pick a style, export. Word-by-word captions that land on time.",
    type: "website",
  },
};

const STEPS = [
  { title: "Drop a video", text: "MP4, MOV or WEBM, up to 30 minutes. We transcribe it word by word, in its language." },
  { title: "Review the text", text: "Fix a word, split or merge a caption, nudge its timing. It's a document, not a timeline." },
  { title: "Pick a style, export", text: "Five presets you can tweak. The MP4 looks exactly like the preview." },
];

const FAQ = [
  {
    q: "Which languages work?",
    a: "Fala detects the spoken language automatically and works with dozens of them, including English, Spanish, Portuguese, French, German, Hindi and Japanese.",
  },
  {
    q: "What happens to my videos?",
    a: "They stay private to your account. Audio is sent to our transcription provider and deleted there right after. Exports are kept for 30 days, originals while you keep working on them.",
  },
  { q: "Can I cancel anytime?", a: "Yes. Your plan stays until the end of the period you paid for, then you're on Free. Your projects stay." },
  { q: "Is there a watermark?", a: "No, on any plan — Free included." },
];

export default function LandingPage() {
  return (
    <main>
      <section className="mx-auto grid max-w-[1120px] items-center gap-12 px-6 pt-12 pb-20 min-[720px]:px-8 min-[900px]:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-6">
          <h1 className="text-[clamp(44px,7vw,76px)] leading-[0.95] font-bold tracking-[-0.05em] text-balance">
            Captions that land on every word<span className="text-accent">.</span>
          </h1>
          <p className="max-w-[520px] text-[18px] text-pretty text-muted">
            Upload a short video, review the text, pick a style and export an MP4 with burned-in captions. No timeline to learn.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/sign-in" className="rounded-[11px] bg-accent px-5 py-3 text-[15px] font-bold text-ink hover:bg-accent-hover">
              Start free
            </Link>
            <span className="font-mono text-[12px] text-muted">{PLANS.free.monthlyMinutes} minutes a month · no card · no watermark</span>
          </div>
        </div>
        <div className="flex justify-center">
          <CaptionDemo />
        </div>
      </section>

      <section id="how" className="border-t border-line">
        <div className="mx-auto grid max-w-[1120px] gap-6 px-6 py-16 min-[720px]:grid-cols-3 min-[720px]:px-8">
          {STEPS.map((step, index) => (
            <div key={step.title} className="flex flex-col gap-2">
              <span className="font-mono text-[12px] text-accent">0{index + 1}</span>
              <h2 className="text-[22px] font-bold tracking-[-0.02em]">{step.title}</h2>
              <p className="text-[15px] text-pretty text-muted">{step.text}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto max-w-[1120px] px-6 pb-16 font-mono text-[12px] text-muted min-[720px]:px-8">
          Presets: {Object.values(PRESETS).map((preset) => preset.name).join(" · ")}
        </p>
      </section>

      <section id="pricing" className="border-t border-line" aria-labelledby="pricing-title">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-8 px-6 py-16 min-[720px]:px-8">
          <div className="flex flex-col gap-2">
            <h2 id="pricing-title" className="text-[40px] leading-none font-bold tracking-[-0.04em]">
              Pricing
            </h2>
            <p className="text-[15px] text-muted">Pay monthly, or yearly and save 25%. Prices in USD; taxes are calculated at checkout.</p>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
            {PLAN_KEYS.map((key) => {
              const plan = PLANS[key];
              return (
                <article key={key} aria-label={plan.name} className="flex flex-col gap-4 rounded-[16px] border border-line bg-panel-1 p-6">
                  <span className="text-[20px] font-bold tracking-[-0.02em]">{plan.name}</span>
                  <div className="flex flex-col gap-1">
                    <span className="flex items-baseline gap-1">
                      <span className="text-[40px] leading-none font-bold tracking-[-0.05em]">${plan.monthlyUsd}</span>
                      <span className="text-[14px] text-muted">/ month</span>
                    </span>
                    <span className="font-mono text-[11.5px] text-muted">
                      {plan.yearlyUsd > 0 ? `or $${plan.yearlyUsd} / year` : "free forever"}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-1.5 text-[14px] text-muted">
                    <li>
                      <span className="text-text">{plan.monthlyMinutes} minutes</span> of video a month
                    </li>
                    <li>
                      Videos up to <span className="text-text">{plan.maxVideoMs / 60_000} minutes</span>
                    </li>
                    <li>
                      <span className="text-text">{plan.maxResolution}p</span> exports, no watermark
                    </li>
                    <li>
                      <span className="text-text">{plan.simultaneousExports}</span> {plan.simultaneousExports === 1 ? "export" : "exports"} at a time
                    </li>
                  </ul>
                  <Link href="/sign-in" className="mt-auto rounded-[9px] border border-line-button px-3.5 py-2 text-center text-[13.5px] font-semibold hover:bg-panel-2">
                    {key === "free" ? "Start free" : `Get ${plan.name}`}
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-line" aria-labelledby="faq-title">
        <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-6 py-16 min-[720px]:px-8">
          <h2 id="faq-title" className="text-[32px] font-bold tracking-[-0.03em]">
            Questions
          </h2>
          {FAQ.map((item) => (
            <div key={item.q} className="flex flex-col gap-1.5 border-b border-line pb-5">
              <h3 className="text-[16px] font-semibold">{item.q}</h3>
              <p className="text-[15px] text-pretty text-muted">{item.a}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
