"use client";

import { useEffect, useState } from "react";
import { PRESETS } from "@fala/shared";
import { CaptionSample } from "@/components/caption-sample";

const LINES = [
  ["Every", "word", "lands"],
  ["right", "on", "time,"],
  ["in", "any", "language."],
];

/** The landing's moving example: the Bold Highlight preset speaking word by word. */
export function CaptionDemo() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setStep((current) => (current + 1) % (LINES.length * 3)), 420);
    return () => window.clearInterval(timer);
  }, []);
  const line = LINES[Math.floor(step / 3)];
  return (
    <div
      aria-hidden
      className="relative aspect-[9/16] w-[min(320px,80vw)] overflow-hidden rounded-2xl shadow-[0_40px_100px_-30px_rgba(0,0,0,.85),0_0_0_1px_rgba(236,230,218,.08)] [container-type:inline-size]"
      style={{
        background:
          "radial-gradient(45% 32% at 52% 58%,#7a5640 0%,rgba(122,86,64,0) 100%),radial-gradient(120% 80% at 25% 15%,#4a3526 0%,#1d1611 55%,#0d0b09 100%)",
      }}
    >
      <CaptionSample key={Math.floor(step / 3)} style={PRESETS.bold.style} words={line} activeIndex={step % 3} />
    </div>
  );
}
