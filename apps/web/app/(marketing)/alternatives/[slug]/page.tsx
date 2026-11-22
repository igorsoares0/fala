import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { findPage, pagesOfType } from "@/lib/pseo/content";
import { pageMetadata } from "@/lib/pseo/seo";
import { PageFallback } from "../../_pseo/parts";
import { AlternativeTemplate } from "../../_pseo/alternative-page";

export function generateStaticParams() {
  return pagesOfType("alternative").map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps<"/alternatives/[slug]">): Promise<Metadata> {
  const page = findPage("alternative", (await params).slug);
  return page ? pageMetadata(page) : {};
}

// Reading `params` sits inside <Suspense> so client navigations stay instant (Next.js
// requires this even for params listed by generateStaticParams).
export default function AlternativePage({ params }: PageProps<"/alternatives/[slug]">) {
  return (
    <Suspense fallback={<PageFallback />}>
      <AlternativeContent params={params} />
    </Suspense>
  );
}

async function AlternativeContent({ params }: Pick<PageProps<"/alternatives/[slug]">, "params">) {
  const page = findPage("alternative", (await params).slug);
  if (!page) notFound();
  return <AlternativeTemplate page={page} />;
}
