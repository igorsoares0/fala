import { requireUser } from "@/lib/dal";
import { initials } from "@/lib/initials";
import { SignOutButton } from "./sign-out-button";

export async function UserMenu() {
  const user = await requireUser();
  return (
    <SignOutButton
      title={`Signed in as ${user.email}. Sign out`}
      className="grid size-8 place-items-center rounded-full bg-text text-xs font-bold text-ink"
    >
      {initials(user.name)}
    </SignOutButton>
  );
}
