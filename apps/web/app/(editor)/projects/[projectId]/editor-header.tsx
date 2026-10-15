import { BackLink } from "./back-link";

/** Editor header bar (56px): ← Projects · divider · whatever the state of the project calls for. */
export function EditorHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
      <BackLink />
      <span className="h-5 w-px bg-line" aria-hidden />
      {children}
    </header>
  );
}
