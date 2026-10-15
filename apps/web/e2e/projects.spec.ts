import { expect, test } from "@playwright/test";
import { createProject, signUp, uniqueEmail } from "./helpers";

test("create a project from a file, rename it, then delete it", async ({ page }) => {
  await signUp(page, { name: "Creator", email: uniqueEmail("crud") });

  // Dropping a file creates the project on the dashboard; opening it leads to the editor.
  const newCard = await createProject(page, "Morning_vlog take 2.mp4");
  await newCard.getByRole("link", { name: "Open Morning vlog take 2" }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
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

test("another account cannot open someone else's project or its thumbnail", async ({ browser }) => {
  const ownerPage = await (await browser.newContext()).newPage();
  await signUp(ownerPage, { name: "Owner", email: uniqueEmail("owner") });
  const card = await createProject(ownerPage, "Secret plans.mov");
  await expect(card.getByText("Ready")).toBeVisible({ timeout: 30_000 });
  const href = await card.getByRole("link", { name: "Open Secret plans" }).getAttribute("href");
  const projectUrl = new URL(href!, ownerPage.url()).toString();

  const otherPage = await (await browser.newContext()).newPage();
  await signUp(otherPage, { name: "Other", email: uniqueEmail("other") });
  await otherPage.goto(projectUrl);
  await expect(otherPage.getByRole("heading", { name: "Nothing here" })).toBeVisible();
  await expect(otherPage.getByText("Secret plans")).toHaveCount(0);

  // The owner gets redirected to the signed image; anyone else gets a 404.
  const thumbnailPath = `${href}/thumbnail`.replace(/^\/projects/, "/api/projects");
  expect((await otherPage.request.get(thumbnailPath, { maxRedirects: 0 })).status()).toBe(404);
  expect((await ownerPage.request.get(thumbnailPath, { maxRedirects: 0 })).status()).toBe(302);
});
