import { PRESETS } from "@fala/shared";
import { CaptionSample } from "@/components/caption-sample";
import { relatedPages } from "@/lib/pseo/content";
import type { PlatformPage } from "@/lib/pseo/load";
import { isPending, SHOW_PENDING } from "@/lib/pseo/pending";
import { Band, CtaBand, Faq, Hero, JsonLd, MediaSlot, Paragraphs, Related, SectionTitle, Text } from "./parts";

const SAMPLE_WORDS = ["Captions", "that", "land"];

const FRAME_CLASS = {
  "9:16": "aspect-[9/16] w-[260px]",
  "1:1": "aspect-square w-[340px]",
  "16:9": "aspect-video w-[420px]",
} as const;

/** "Add captions to <platform>": specs, safe zone, native vs burned-in, recommended preset. */
export function PlatformTemplate({ page }: { page: PlatformPage }) {
  const preset = PRESETS[page.recommendedPreset.preset];
  const specs = [
    { label: "Aspect ratio", value: page.specs.aspectRatio },
    { label: "Maximum length", value: page.specs.maxLength },
    { label: "Recommended resolution", value: page.specs.resolution },
  ].filter((spec) => SHOW_PENDING || !isPending(spec.value));
  return (
    <main>
      <JsonLd page={page} />
      <Hero page={page} />

      {specs.length > 0 && (
        <Band label={`${page.platform} video specs`}>
          <SectionTitle>{page.platform} video specs</SectionTitle>
          <dl className="grid gap-4 min-[720px]:grid-cols-3">
            {specs.map((spec) => (
              <div key={spec.label} className="flex flex-col gap-1.5 rounded-[16px] border border-line bg-panel-1 p-5">
                <dt className="font-mono text-[11.5px] text-muted">{spec.label}</dt>
                <dd className="text-[17px] font-semibold">
                  <Text value={spec.value} />
                </dd>
              </div>
            ))}
          </dl>
          <p className="font-mono text-[11.5px] text-muted">From {page.platform}&apos;s help pages and recent guides. Limits change and can vary by account: check the app before you post.</p>
        </Band>
      )}

      <Band label="Safe zone">
        <SectionTitle>Where {page.platform}&apos;s interface covers the video</SectionTitle>
        <Paragraphs paragraphs={[page.safeZone.description]} />
        <MediaSlot asset={page.safeZone.screenshot} />
      </Band>

      <Band label="Built-in vs burned-in captions">
        <SectionTitle>{page.platform} captions vs burned-in captions</SectionTitle>
        <div className="overflow-x-auto rounded-[16px] border border-line">
          <table className="w-full min-w-[560px] border-collapse text-left text-[14.5px]">
            <thead className="bg-panel-1 text-[13px] text-muted">
              <tr>
                <th scope="col" className="w-[22%] px-5 py-3 font-semibold">
                  <span className="sr-only">Aspect</span>
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  {page.platform}&apos;s own captions
                </th>
                <th scope="col" className="px-5 py-3 font-semibold text-text">
                  Burned-in captions
                </th>
              </tr>
            </thead>
            <tbody>
              {page.nativeComparison.map((row) => (
                <tr key={row.aspect} className="border-t border-line align-top">
                  <th scope="row" className="px-5 py-3.5 font-semibold">
                    <Text value={row.aspect} />
                  </th>
                  <td className="px-5 py-3.5 text-muted">
                    <Text value={row.native} />
                  </td>
                  <td className="px-5 py-3.5">
                    <Text value={row.burnedIn} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Band>

      <Band label="Recommended style">
        <div className="grid items-center gap-10 min-[820px]:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-4">
            <span className="font-mono text-[12px] text-accent">Recommended style</span>
            <SectionTitle>{preset.name}</SectionTitle>
            <Paragraphs paragraphs={[page.recommendedPreset.reason]} />
            <MediaSlot asset={page.presetPreview} />
          </div>
          <div
            className={`relative max-w-full justify-self-center overflow-hidden rounded-2xl shadow-frame [container-type:inline-size] ${FRAME_CLASS[page.previewFrame]}`}
            style={{ background: "radial-gradient(45% 32% at 52% 58%,#7a5640 0%,rgba(122,86,64,0) 100%),radial-gradient(120% 80% at 25% 15%,#4a3526 0%,#1d1611 55%,#0d0b09 100%)" }}
            role="img"
            aria-label={`A ${page.previewFrame} video with captions in the ${preset.name} style`}
          >
            <CaptionSample style={preset.style} words={SAMPLE_WORDS} activeIndex={2} tall={page.previewFrame === "9:16"} />
          </div>
        </div>
      </Band>

      <Faq page={page} />
      <Related pages={relatedPages(page)} />
      <CtaBand cta={page.cta} />
    </main>
  );
}
