import { LEGAL } from "@/lib/legal";

/** Shared frame of the policy pages: title, effective date, a draft notice and readable prose. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-6 px-6 pt-10 pb-20 min-[720px]:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-[44px] leading-none font-bold tracking-[-0.045em]">{title}</h1>
        <span className="font-mono text-[12px] text-muted">Effective {LEGAL.effectiveDate}</span>
      </div>
      <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-pretty text-muted [&_h2]:mt-4 [&_h2]:text-[19px] [&_h2]:font-bold [&_h2]:text-text [&_strong]:text-text [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </main>
  );
}
