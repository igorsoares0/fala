import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { smallCreamButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col px-8 py-7">
      <Wordmark />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-[40px] leading-none font-bold tracking-[-0.045em]">Nothing here</h1>
        <p className="max-w-[360px] text-[15px] text-pretty text-muted">
          This page or project doesn&apos;t exist, or it belongs to another account.
        </p>
        <Link href="/projects" className={smallCreamButton}>
          Back to projects
        </Link>
      </main>
    </div>
  );
}
