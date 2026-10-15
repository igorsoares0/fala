"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({
  children,
  className,
  title = "Sign out",
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <button type="button" onClick={signOut} title={title} aria-label="Sign out" className={className}>
      {children}
    </button>
  );
}
