import type { Metadata } from "next";
import { requirePage } from "@/lib/pseo/content";
import { pageMetadata } from "@/lib/pseo/seo";
import { HubTemplate } from "../_pseo/hub-page";

const page = requirePage("hub", "captions-for");

export const metadata: Metadata = pageMetadata(page);

export default function CaptionsForHubPage() {
  return <HubTemplate page={page} />;
}
