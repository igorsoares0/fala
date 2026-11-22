import type { Metadata } from "next";
import { requirePage } from "@/lib/pseo/content";
import { pageMetadata } from "@/lib/pseo/seo";
import { FeatureTemplate } from "../_pseo/feature-page";

const page = requirePage("feature", "burn-in-subtitles");

export const metadata: Metadata = pageMetadata(page);

export default function BurnInSubtitlesPage() {
  return <FeatureTemplate page={page} />;
}
