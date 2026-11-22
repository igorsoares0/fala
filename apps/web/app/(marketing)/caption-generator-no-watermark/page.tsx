import type { Metadata } from "next";
import { requirePage } from "@/lib/pseo/content";
import { pageMetadata } from "@/lib/pseo/seo";
import { FeatureTemplate } from "../_pseo/feature-page";

const page = requirePage("feature", "caption-generator-no-watermark");

export const metadata: Metadata = pageMetadata(page);

export default function CaptionGeneratorNoWatermarkPage() {
  return <FeatureTemplate page={page} />;
}
