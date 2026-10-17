"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/projects", label: "Projects" },
  { href: "/billing", label: "Plan & usage" },
  { href: "/account", label: "Account" },
] as const;

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 text-sm">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 font-medium transition-colors hover:text-text ${
              active ? "bg-panel-2 text-text" : "text-muted"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
