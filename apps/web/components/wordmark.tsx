import Link from "next/link";

export function Wordmark({ href = "/projects" }: { href?: string }) {
  return (
    <Link
      href={href}
      aria-label="Supertitle, home"
      className="text-2xl font-extrabold leading-none tracking-[-0.05em] text-text"
    >
      supertitle<span className="text-accent">.</span>
    </Link>
  );
}
