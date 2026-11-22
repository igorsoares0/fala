import { relatedPages } from "@/lib/pseo/content";
import { COMPARISON_ROWS, supertitleComparison } from "@/lib/pseo/facts";
import type { AlternativePage } from "@/lib/pseo/load";
import { Band, CtaBand, Faq, Hero, JsonLd, Paragraphs, Related, SectionTitle, Text } from "./parts";

/** "<Competitor> alternative": verdict, comparison table, where they win, switching steps. */
export function AlternativeTemplate({ page }: { page: AlternativePage }) {
  const ours = supertitleComparison();
  return (
    <main>
      <JsonLd page={page} />
      <Hero page={page} />

      <Band label="The short answer">
        <SectionTitle>The short answer</SectionTitle>
        <Paragraphs paragraphs={[page.verdict]} />
      </Band>

      <Band label={`Supertitle vs ${page.competitor}`}>
        <SectionTitle>
          Supertitle vs {page.competitor}
        </SectionTitle>
        <div className="overflow-x-auto rounded-[16px] border border-line">
          <table className="w-full min-w-[560px] border-collapse text-left text-[14.5px]">
            <thead className="bg-panel-1 text-[13px] text-muted">
              <tr>
                <th scope="col" className="w-[28%] px-5 py-3 font-semibold">
                  <span className="sr-only">Feature</span>
                </th>
                <th scope="col" className="px-5 py-3 font-semibold text-text">
                  Supertitle
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  {page.competitor}
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.key} className="border-t border-line align-top">
                  <th scope="row" className="px-5 py-3.5 font-semibold">
                    {row.label}
                  </th>
                  <td className="px-5 py-3.5">{ours[row.key]}</td>
                  <td className="px-5 py-3.5 text-muted">
                    <Text value={page.comparisonTable[row.key]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="font-mono text-[11.5px] text-muted">
          Competitor details from their sites and recent reviews, checked in <Text value={page.comparisonCheckedOn} />. Plans and prices change: check their pricing pages before deciding.
        </p>
      </Band>

      <Band label={`Where ${page.competitor} wins`}>
        <SectionTitle>Where {page.competitor} wins</SectionTitle>
        <ul className="flex max-w-[680px] list-disc flex-col gap-2 pl-5 text-[15.5px] leading-relaxed text-pretty text-muted marker:text-accent">
          {page.whereTheyWin.map((point) => (
            <li key={point}>
              <Text value={point} />
            </li>
          ))}
        </ul>
      </Band>

      <Band label="Switch in three steps">
        <SectionTitle>Caption your first video in three steps</SectionTitle>
        <ol className="grid gap-6 min-[720px]:grid-cols-3">
          {page.switchingSteps.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-2">
              <span className="font-mono text-[12px] text-accent">0{index + 1}</span>
              <h3 className="text-[20px] font-bold tracking-[-0.02em]">
                <Text value={step.title} />
              </h3>
              <p className="text-[15px] text-pretty text-muted">
                <Text value={step.text} />
              </p>
            </li>
          ))}
        </ol>
      </Band>

      <Faq page={page} />
      <Related pages={relatedPages(page)} />
      <CtaBand cta={page.cta} />
    </main>
  );
}
