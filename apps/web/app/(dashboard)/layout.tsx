import { Suspense } from "react";
import { Wordmark } from "@/components/wordmark";
import { AppNav } from "./app-nav";
import { UsageMeter } from "./usage-meter";
import { UserMenu } from "./user-menu";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-8 border-b border-line px-8 py-4">
        <Wordmark />
        <AppNav />
        <div className="flex-1" />
        <Suspense fallback={null}>
          <UsageMeter />
        </Suspense>
        <Suspense fallback={<span className="size-8 rounded-full bg-panel-2" />}>
          <UserMenu />
        </Suspense>
      </header>
      {children}
    </div>
  );
}
