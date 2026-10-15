import { expect, test } from "@playwright/test";
import { createProject, signUp, uniqueEmail } from "./helpers";

test("create a project from a file, rename it, then delete it", async ({ page }) => {
  await signUp(page, { name: "Creator", email: uniqueEmail("crud") });

  await createProject(page, "Morning_vlog take 2.mp4");
  const nameInput = page.getByLabel("Project name");
  await expect(nameInput).toHaveValue("Morning vlog take 2");

  await nameInput.fill("Morning vlog — final");
  await nameInput.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  // The new name is persisted on the server.
  await page.reload();
  await expect(page.getByLabel("Project name")).toHaveValue("Morning vlog — final");

  await page.getByRole("link", { name: "← Projects" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  const card = page.getByRole("article", { name: "Morning vlog — final" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Waiting for upload")).toBeVisible();
  await expect(page.getByText("1 video", { exact: true })).toBeVisible();

  // Deleting asks first; "Keep" cancels.
  await card.getByRole("button", { name: "Delete Morning vlog — final" }).click();
  await card.getByRole("button", { name: "Keep" }).click();
  await expect(card).toBeVisible();

  await card.getByRole("button", { name: "Delete Morning vlog — final" }).click();
  await card.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByText("0 videos")).toBeVisible();
});

test("another account cannot open someone else's project", async ({ browser }) => {
  const ownerPage = await (await browser.newContext()).newPage();
  await signUp(ownerPage, { name: "Owner", email: uniqueEmail("owner") });
  await createProject(ownerPage, "Secret plans.mov");
  const projectUrl = ownerPage.url();

  const otherPage = await (await browser.newContext()).newPage();
  await signUp(otherPage, { name: "Other", email: uniqueEmail("other") });
  await otherPage.goto(projectUrl);
  await expect(otherPage.getByRole("heading", { name: "Nothing here" })).toBeVisible();
  await expect(otherPage.getByText("Secret plans")).toHaveCount(0);
});
