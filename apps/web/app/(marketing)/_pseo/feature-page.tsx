import { PLANS } from "@fala/shared";
import { relatedPages } from "@/lib/pseo/content";
import type { FeaturePage } from "@/lib/pseo/load";
import { Band, CtaBand, Faq, Hero, JsonLd, MediaSlot, Paragraphs, Related, SectionCard, SectionTitle, Text } from "./parts";

/** Feature pages: each slug has its own sections (docs/PSEO_PLAN.md, section 5). */
export function FeatureTemplate({ page }: { page: FeaturePage }) {
  return (
    <main>
      <JsonLd page={page} />
      <Hero page={page} />
      {page.slug === "burn-in-subtitles" ? <BurnInSections page={page} /> : <NoWatermarkSections page={page} />}
      <Faq page={page} />
      <Related pages={relatedPages(page)} />
      <CtaBand cta={page.cta} />
    </main>
  );
}

function BurnInSections({ page }: { page: Extract<FeaturePage, { slug: "burn-in-subtitles" }> }) {
  return (
    <>
      <Band label="Open vs closed captions">
        <SectionTitle>Open vs closed captions</SectionTitle>
        <div className="grid gap-4 min-[720px]:grid-cols-2">
          {page.openVsClosed.map((section) => (
            <SectionCard key={section.heading} section={section} />
          ))}
        </div>
        <MediaSlot asset={page.beforeAfter} />
      </Band>
      <Band label={page.whyBurnedIn.heading}>
        <SectionTitle>{page.whyBurnedIn.heading}</SectionTitle>
        <Paragraphs paragraphs={page.whyBurnedIn.paragraphs} />
      </Band>
    </>
  );
}

function NoWatermarkSections({ page }: { page: Extract<FeaturePage, { slug: "caption-generator-no-watermark" }> }) {
  const free = PLANS.free;
  const limits = [
    { label: "Video per month", value: `${free.monthlyMinutes} minutes` },
    { label: "Longest video", value: `${free.maxVideoMs / 60_000} minutes` },
    { label: "Export quality", value: `${free.maxResolution}p MP4` },
    { label: "Watermark", value: "None" },
  ];
  return (
    <>
      <Band label="The free plan">
        <SectionTitle>What the free plan includes</SectionTitle>
        <dl className="grid gap-4 min-[720px]:grid-cols-4">
          {limits.map((limit) => (
            <div key={limit.label} className="flex flex-col gap-1.5 rounded-[16px] border border-line bg-panel-1 p-5">
              <dt className="font-mono text-[11.5px] text-muted">{limit.label}</dt>
              <dd className="text-[17px] font-semibold">{limit.value}</dd>
            </div>
          ))}
        </dl>
        <MediaSlot asset={page.sampleExport} />
      </Band>
      <Band label="Free plans and watermarks">
        <SectionTitle>Free plans and watermarks</SectionTitle>
        <div className="overflow-x-auto rounded-[16px] border border-line">
          <table className="w-full min-w-[480px] border-collapse text-left text-[14.5px]">
            <thead className="bg-panel-1 text-[13px] text-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Tool
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Watermark on free exports
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line">
                <th scope="row" className="px-5 py-3.5 font-semibold">
                  Supertitle
                </th>
                <td className="px-5 py-3.5">None</td>
              </tr>
              {page.competitorWatermarks.map((row) => (
                <tr key={row.competitor} className="border-t border-line">
                  <th scope="row" className="px-5 py-3.5 font-semibold">
                    {row.competitor}
                  </th>
                  <td className="px-5 py-3.5 text-muted">
                    <Text value={row.policy} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="font-mono text-[11.5px] text-muted">
          Competitor details from their sites and recent reviews, checked in <Text value={page.competitorsCheckedOn} />. Plans and prices change: check their pricing pages before deciding.
        </p>
      </Band>
      {page.sections.map((section) => (
        <Band key={section.heading} label={section.heading}>
          <SectionTitle>{section.heading}</SectionTitle>
          <Paragraphs paragraphs={section.paragraphs} />
        </Band>
      ))}
    </>
  );
}
