import type { Metadata } from "next";
import { Suspense } from "react";
import { db } from "@fala/db";
import { requireUser } from "@/lib/dal";
import { initials } from "@/lib/initials";
import { outlineButton } from "@/components/ui";
import { SignOutButton } from "../sign-out-button";
import { DeleteAccount } from "./delete-account";
import { Preferences } from "./preferences";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <main className="mx-auto flex max-w-[680px] flex-col gap-9 px-8 pt-11 pb-24">
      <h1 className="text-[52px] leading-none font-bold tracking-[-0.045em]">Account</h1>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-panel-1" />}>
        <Profile />
      </Suspense>
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-[3px]">
          <span className="text-[15px] font-semibold">Sign out</span>
          <span className="text-[13px] text-muted">End your session on this device.</span>
        </div>
        <SignOutButton className={outlineButton}>Sign out</SignOutButton>
      </section>
    </main>
  );
}

async function Profile() {
  const user = await requireUser();
  const [accounts, settings] = await Promise.all([
    db.account.findMany({ where: { userId: user.id }, select: { providerId: true } }),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { emailOnExport: true } }),
  ]);
  const google = accounts.some((account) => account.providerId === "google");
  const hasPassword = accounts.some((account) => account.providerId === "credential");
  return (
    <>
    <section className="flex flex-col gap-5 border-b border-line pb-9">
      <span className="text-[22px] font-bold tracking-[-0.03em]">Profile</span>
      <div className="flex items-center gap-4">
        <span className="grid size-16 flex-none place-items-center rounded-full bg-text text-[22px] font-bold tracking-[-0.02em] text-ink">
          {initials(user.name)}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[17px] font-bold tracking-[-0.01em]">{user.name}</span>
          <span className="truncate font-mono text-[11.5px] text-muted">{google ? "connected with Google" : user.email}</span>
        </div>
      </div>
      <ProfileForm initialName={user.name} email={user.email} />
    </section>
    <Preferences email={user.email} hasPassword={hasPassword} emailOnExport={settings.emailOnExport} />
    <DeleteAccount email={user.email} />
    </>
  );
}
