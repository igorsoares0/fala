import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { findPage, pagesOfType } from "@/lib/pseo/content";
import { pageMetadata } from "@/lib/pseo/seo";
import { PageFallback } from "../../_pseo/parts";
import { ToolTemplate } from "../../_pseo/tool-page";

export function generateStaticParams() {
  return pagesOfType("tool").map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps<"/tools/[slug]">): Promise<Metadata> {
  const page = findPage("tool", (await params).slug);
  return page ? pageMetadata(page) : {};
}

// Reading `params` sits inside <Suspense> so client navigations stay instant (Next.js
// requires this even for params listed by generateStaticParams).
export default function ToolPage({ params }: PageProps<"/tools/[slug]">) {
  return (
    <Suspense fallback={<PageFallback />}>
      <ToolContent params={params} />
    </Suspense>
  );
}

async function ToolContent({ params }: Pick<PageProps<"/tools/[slug]">, "params">) {
  const page = findPage("tool", (await params).slug);
  if (!page) notFound();
  return <ToolTemplate page={page} />;
}
