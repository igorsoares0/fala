/**
 * Lists every pending marker (`TODO(igor): …`) in the pSEO content, by page.
 *
 *   npm run pseo:pending
 *
 * Pages listed here are built as noindex and left out of the sitemap until they're clean.
 * Exits with an error if the content itself is invalid.
 */
import { PAGES } from "../lib/pseo/content";

const pending = PAGES.filter((page) => page.pending.length > 0);
const drafts = PAGES.filter((page) => page.status === "draft");

for (const page of pending) {
  console.log(`\n${page.path}  (${page.file})`);
  for (const marker of page.pending) console.log(`  - ${marker.field}: ${marker.note}`);
}

const total = pending.reduce((sum, page) => sum + page.pending.length, 0);
console.log(`\n${total} pending marker${total === 1 ? "" : "s"} on ${pending.length} of ${PAGES.length} pages.`);
if (drafts.length > 0) console.log(`Drafts (noindex regardless of markers): ${drafts.map((page) => page.path).join(", ")}`);
console.log(`Indexable now: ${PAGES.filter((page) => page.indexable).map((page) => page.path).join(", ") || "none"}`);
