import Link from "next/link";
import { cardText } from "@/lib/pseo/content";
import { freePlanNote } from "@/lib/pseo/facts";
import type { PseoPage } from "@/lib/pseo/load";
import { isPending, pendingNote, SHOW_PENDING } from "@/lib/pseo/pending";
import type { Asset, Section as SectionContent } from "@/lib/pseo/schema";
import { breadcrumbs, pageJsonLd, serializeJsonLd } from "@/lib/pseo/seo";

/** Building blocks of the pSEO templates, styled like the landing page. Server-only, no client JS. */

export const SIGN_UP_PATH = "/sign-in";

export function JsonLd({ page }: { page: PseoPage }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(pageJsonLd(page)) }} />;
}

/** Keeps the footer in place while a page's content streams in on a client navigation. */
export function PageFallback() {
  return <main className="min-h-[70vh]" aria-busy />;
}

/** A full-width band with a top rule, like the landing's sections. */
export function Band({ children, label, narrow = false }: { children: React.ReactNode; label?: string; narrow?: boolean }) {
  return (
    <section className="border-t border-line" aria-label={label}>
      <div className={`mx-auto flex flex-col gap-6 px-6 py-14 min-[720px]:px-8 ${narrow ? "max-w-[760px]" : "max-w-[1120px]"}`}>{children}</div>
    </section>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[30px] leading-[1.05] font-bold tracking-[-0.035em] text-balance">{children}</h2>;
}

export function Paragraphs({ paragraphs }: { paragraphs: string[] }) {
  return (
    <div className="flex max-w-[680px] flex-col gap-3 text-[15.5px] leading-relaxed text-pretty text-muted">
      {paragraphs.map((paragraph) => (
        <Text key={paragraph} as="p" value={paragraph} />
      ))}
    </div>
  );
}

/** A block of content with its own heading (h3), for two-up layouts. */
export function SectionCard({ section }: { section: SectionContent }) {
  return (
    <div className="flex flex-col gap-2 rounded-[16px] border border-line bg-panel-1 p-6">
      <h3 className="text-[19px] font-bold tracking-[-0.02em]">{section.heading}</h3>
      <Paragraphs paragraphs={section.paragraphs} />
    </div>
  );
}

/** Content still waiting for input: visible in development, hidden in production (see SHOW_PENDING). */
export function Pending({ value, inline = false }: { value: string; inline?: boolean }) {
  if (!SHOW_PENDING) return inline ? <span>—</span> : null;
  const note = pendingNote(value);
  if (inline) {
    return (
      <span className="font-mono text-[11.5px] text-warning" data-pending>
        Pending: {note}
      </span>
    );
  }
  return (
    <div className="rounded-[14px] border border-dashed border-warning/50 bg-panel-1 px-5 py-4 font-mono text-[12px] text-warning" data-pending>
      Pending: {note}
    </div>
  );
}

/** A text value, or its pending marker. */
export function Text({ value, as: Tag = "span" }: { value: string; as?: "span" | "p" }) {
  return isPending(value) ? <Pending value={value} inline={Tag === "span"} /> : <Tag>{value}</Tag>;
}

/** An image or video slot: lazy-loaded with explicit dimensions, or a pending placeholder. */
export function MediaSlot({ asset }: { asset: Asset }) {
  if (typeof asset === "string") return <Pending value={asset} />;
  if (/\.(mp4|webm)$/.test(asset.src)) {
    return (
      <video
        src={asset.src}
        width={asset.width}
        height={asset.height}
        aria-label={asset.alt}
        controls
        muted
        playsInline
        preload="none"
        className="h-auto w-full max-w-[420px] rounded-[14px] shadow-frame"
      />
    );
  }
  // A plain <img> keeps content pages free of client JS (next/image ships a client component).
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={asset.src} width={asset.width} height={asset.height} alt={asset.alt} loading="lazy" decoding="async" className="h-auto w-full rounded-[14px] shadow-frame" />;
}

export function StartFreeButton() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link href={SIGN_UP_PATH} className="rounded-[11px] bg-accent px-5 py-3 text-[15px] font-bold text-ink hover:bg-accent-hover">
        Start free
      </Link>
      <span className="font-mono text-[12px] text-muted">{freePlanNote()}</span>
    </div>
  );
}

export function Breadcrumbs({ page }: { page: PseoPage }) {
  const crumbs = breadcrumbs(page);
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="font-mono text-[12px] text-muted">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={crumb.path} className="flex items-center gap-2">
              {last ? (
                <span aria-current="page" className="text-text">
                  {crumb.name}
                </span>
              ) : (
                <>
                  <Link href={crumb.path} className="hover:text-text">
                    {crumb.name}
                  </Link>
                  <span aria-hidden>/</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Breadcrumbs, H1, intro and (by default) the sign-up call to action. */
export function Hero({ page, cta = true }: { page: PseoPage; cta?: boolean }) {
  return (
    <section className="mx-auto flex max-w-[1120px] flex-col gap-6 px-6 pt-10 pb-14 min-[720px]:px-8">
      <Breadcrumbs page={page} />
      <h1 className="max-w-[860px] text-[clamp(38px,6vw,60px)] leading-[0.98] font-bold tracking-[-0.045em] text-balance">
        <Text value={page.h1} />
      </h1>
      <p className="max-w-[640px] text-[18px] text-pretty text-muted">
        <Text value={page.intro} />
      </p>
      {cta && <StartFreeButton />}
    </section>
  );
}

/**
 * A linked card for hubs and "Related" blocks. `prefetch` loads the whole (static) page
 * ahead of the click, so the content behind its <Suspense> boundary shows up instantly.
 */
export function PageCard({ page }: { page: PseoPage }) {
  return (
    <Link href={page.path} prefetch className="flex flex-col gap-2 rounded-[16px] border border-line bg-panel-1 p-6 transition-colors hover:border-line-strong hover:bg-panel-2">
      <span className="text-[18px] leading-tight font-bold tracking-[-0.02em]">{page.h1}</span>
      <span className="text-[14px] text-pretty text-muted">{cardText(page)}</span>
    </Link>
  );
}

export function CardGrid({ pages }: { pages: PseoPage[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-4">
      {pages.map((page) => (
        <PageCard key={page.path} page={page} />
      ))}
    </div>
  );
}

export function Faq({ page }: { page: PseoPage }) {
  return (
    <Band label="Questions" narrow>
      <SectionTitle>Questions</SectionTitle>
      {page.faq.map((item) => (
        <div key={item.question} className="flex flex-col gap-1.5 border-b border-line pb-5">
          <h3 className="text-[16px] font-semibold">
            <Text value={item.question} />
          </h3>
          <p className="text-[15px] text-pretty text-muted">
            <Text value={item.answer} />
          </p>
        </div>
      ))}
    </Band>
  );
}

export function Related({ pages }: { pages: PseoPage[] }) {
  if (pages.length === 0) return null;
  return (
    <Band label="Related">
      <SectionTitle>Related</SectionTitle>
      <CardGrid pages={pages} />
    </Band>
  );
}

const DEFAULT_CTA = { heading: "Caption your next video in minutes", text: "Upload a video, review the text, pick a style and export an MP4." };

/** The closing call to action, to sign-up. */
export function CtaBand({ cta = DEFAULT_CTA }: { cta?: { heading: string; text: string } }) {
  return (
    <Band label="Get started">
      <div className="flex flex-col gap-5 rounded-[20px] border border-line bg-panel-1 p-8 min-[720px]:p-10">
        <h2 className="text-[34px] leading-none font-bold tracking-[-0.04em] text-balance">
          <Text value={cta.heading} />
          <span className="text-accent">.</span>
        </h2>
        <p className="max-w-[560px] text-[16px] text-pretty text-muted">
          <Text value={cta.text} />
        </p>
        <StartFreeButton />
      </div>
    </Band>
  );
}
