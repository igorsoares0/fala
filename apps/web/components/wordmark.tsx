import Link from "next/link";

export function Wordmark({ href = "/projects" }: { href?: string }) {
  return (
    <Link
      href={href}
      aria-label="Fala, home"
      className="text-2xl font-extrabold leading-none tracking-[-0.05em] text-text"
    >
      fala<span className="text-accent">.</span>
    </Link>
  );
}
