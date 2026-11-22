import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { findPage, pagesOfType } from "@/lib/pseo/content";
import { pageMetadata } from "@/lib/pseo/seo";
import { PageFallback } from "../../_pseo/parts";
import { PlatformTemplate } from "../../_pseo/platform-page";

export function generateStaticParams() {
  return pagesOfType("platform").map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps<"/captions-for/[slug]">): Promise<Metadata> {
  const page = findPage("platform", (await params).slug);
  return page ? pageMetadata(page) : {};
}

// Reading `params` sits inside <Suspense> so client navigations stay instant (Next.js
// requires this even for params listed by generateStaticParams).
export default function PlatformPage({ params }: PageProps<"/captions-for/[slug]">) {
  return (
    <Suspense fallback={<PageFallback />}>
      <PlatformContent params={params} />
    </Suspense>
  );
}

async function PlatformContent({ params }: Pick<PageProps<"/captions-for/[slug]">, "params">) {
  const page = findPage("platform", (await params).slug);
  if (!page) notFound();
  return <PlatformTemplate page={page} />;
}
