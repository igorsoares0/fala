import { PRESET_KEYS, PRESETS, type PresetKey } from "@fala/shared";
import { CaptionSample } from "@/components/caption-sample";
import { hubChildren, relatedPages } from "@/lib/pseo/content";
import type { HubPage } from "@/lib/pseo/load";
import { Band, CardGrid, CtaBand, Faq, Hero, JsonLd, Related, Text } from "./parts";

/** A hub: intro, then a card for each published page of its type (or, for /styles, the presets). */
export function HubTemplate({ page }: { page: HubPage }) {
  const children = hubChildren(page.slug);
  return (
    <main>
      <JsonLd page={page} />
      <Hero page={page} />
      <Band label={page.navLabel}>
        {page.slug === "styles" ? (
          <PresetGallery descriptions={page.presets} />
        ) : children.length > 0 ? (
          <CardGrid pages={children} />
        ) : (
          <p className="text-[15px] text-muted">The first guides are on their way.</p>
        )}
      </Band>
      <Faq page={page} />
      <Related pages={relatedPages(page)} />
      <CtaBand />
    </main>
  );
}

/** Words shown in every preset frame; the last one is the "spoken" word. */
const SAMPLE_WORDS = ["Every", "word", "lands"];

/** The five presets, rendered with the same caption CSS as the editor and the export. */
function PresetGallery({ descriptions }: { descriptions: Record<PresetKey, string> }) {
  return (
    <div className="flex flex-col gap-6">
      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 min-[720px]:grid-cols-5">
        {PRESET_KEYS.map((key) => {
          const preset = PRESETS[key];
          return (
            <li key={key} className="flex flex-col gap-3">
              <div
                className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl shadow-frame [container-type:inline-size]"
                style={{ background: "radial-gradient(45% 32% at 52% 58%,#7a5640 0%,rgba(122,86,64,0) 100%),radial-gradient(120% 80% at 25% 15%,#4a3526 0%,#1d1611 55%,#0d0b09 100%)" }}
                role="img"
                aria-label={`A vertical video with captions in the ${preset.name} style`}
              >
                <CaptionSample style={preset.style} words={SAMPLE_WORDS} activeIndex={1} tall />
              </div>
              <h2 className="text-[18px] font-bold tracking-[-0.02em]">{preset.name}</h2>
              <p className="text-[14px] text-pretty text-muted">
                <Text value={descriptions[key]} />
              </p>
            </li>
          );
        })}
      </ul>
      <p className="max-w-[680px] font-mono text-[12px] text-muted">
        Every preset is a starting point: change the font, size, colors, highlight, all caps, outline, shadow, bar, position, word entrance and words per caption.
      </p>
    </div>
  );
}
