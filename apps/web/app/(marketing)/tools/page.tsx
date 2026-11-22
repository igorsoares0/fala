import type { Metadata } from "next";
import { requirePage } from "@/lib/pseo/content";
import { pageMetadata } from "@/lib/pseo/seo";
import { HubTemplate } from "../_pseo/hub-page";

const page = requirePage("hub", "tools");

export const metadata: Metadata = pageMetadata(page);

export default function ToolsHubPage() {
  return <HubTemplate page={page} />;
}
