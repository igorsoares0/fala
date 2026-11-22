import { relatedPages } from "@/lib/pseo/content";
import type { ToolPage } from "@/lib/pseo/load";
import { Converter } from "./converter";
import { Band, CtaBand, Faq, Hero, JsonLd, Related, SectionCard, SectionTitle } from "./parts";

/** A free in-browser tool: the converter first, then the explanation, FAQ and call to action. */
export function ToolTemplate({ page }: { page: ToolPage }) {
  return (
    <main>
      <JsonLd page={page} />
      <Hero page={page} cta={false} />
      <section aria-label="Converter" className="mx-auto max-w-[1120px] px-6 pb-14 min-[720px]:px-8">
        <Converter tool={page.slug} />
      </section>
      <Band label="About the formats">
        <SectionTitle>About the formats</SectionTitle>
        <div className="grid gap-4 min-[720px]:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
          {page.formats.map((section) => (
            <SectionCard key={section.heading} section={section} />
          ))}
        </div>
      </Band>
      <Faq page={page} />
      <CtaBand cta={page.cta} />
      <Related pages={relatedPages(page)} />
    </main>
  );
}
