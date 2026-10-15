import { expect, test, type Page } from "@playwright/test";
import { createProject, signUp, uniqueEmail } from "./helpers";

// WEBM fixture + scripted captions (fake transcription), segmented 3 words per block:
// "It's the rhythm" · "that keeps you watching." · "Every word lands right".
async function openReadyProject(page: Page, label: string) {
  await signUp(page, { name: "Editor", email: uniqueEmail(label) });
  const card = await createProject(page, `${label} clip.webm`, "landscape-2s.webm");
  await expect(card.getByText("Ready")).toBeVisible({ timeout: 30_000 });
  await card.getByRole("link", { name: `Open ${label} clip` }).click();
  await expect(page.getByTestId("caption-block").first()).toBeVisible();
  return page.url();
}

const blocks = (page: Page) => page.getByTestId("caption-block");
const saved = (page: Page) => expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 10_000 });

async function editText(page: Page, blockIndex: number, text: string) {
  await blocks(page).nth(blockIndex).click();
  await page.getByRole("button", { name: "Edit text" }).click();
  await page.getByLabel("Caption text").fill(text);
  await page.getByLabel("Caption text").press("Enter");
}

test("editing a block's text keeps its timing and persists", async ({ page }) => {
  await openReadyProject(page, "edit");
  const timecode = await blocks(page).first().getByRole("button", { name: /Play from/ }).textContent();

  await editText(page, 0, "It's the groove");
  await expect(blocks(page).first()).toContainText("It's the groove");
  await saved(page);

  await page.reload();
  await expect(blocks(page).first()).toContainText("It's the groove");
  await expect(blocks(page).first().getByRole("button", { name: /Play from/ })).toHaveText(timecode!);
});

test("split, merge, undo and redo", async ({ page }) => {
  await openReadyProject(page, "split");
  await expect(blocks(page)).toHaveCount(3);

  await blocks(page).first().click();
  await page.getByRole("button", { name: "Split before “the”" }).click();
  await expect(blocks(page)).toHaveCount(4);
  await expect(blocks(page).first().locator("[dir=auto]")).toHaveText("It's");

  await page.getByRole("button", { name: "Merge with next" }).click();
  await expect(blocks(page)).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Undo merge blocks" })).toBeEnabled();

  await page.getByRole("heading", { name: "Captions" }).click();
  await page.keyboard.press("Control+z");
  await expect(blocks(page)).toHaveCount(4);
  await expect(page.getByText("Undone: merge blocks")).toBeVisible();

  await page.keyboard.press("Control+Shift+z");
  await expect(blocks(page)).toHaveCount(3);
  await expect(page.getByText("Redone: merge blocks")).toBeVisible();
  await saved(page);
});

test("nudging a block's start moves it by 0.1 s and persists", async ({ page }) => {
  await openReadyProject(page, "nudge");
  const second = blocks(page).nth(1);
  await expect(second.getByRole("button", { name: /Play from/ })).toHaveText(/^00:00\.5 →/);

  await second.click();
  await page.getByRole("button", { name: "Start 0.1 s later" }).click();
  await expect(second.getByRole("button", { name: /Play from/ })).toHaveText(/^00:00\.6 →/);
  await saved(page);

  await page.reload();
  await expect(blocks(page).nth(1).getByRole("button", { name: /Play from/ })).toHaveText(/^00:00\.6 →/);
});

test("find and replace keeps timing and can be undone", async ({ page }) => {
  await openReadyProject(page, "replace");
  await page.getByRole("heading", { name: "Captions" }).click();
  await page.keyboard.press("Control+f");

  await page.getByLabel("Wrong word").fill("RHYTHM");
  await expect(page.getByText("1 match in 1 block")).toBeVisible();
  await page.getByLabel("Replace with").fill("beat");
  await page.getByLabel("Replace with").press("Enter");

  await expect(page.getByText("1 word replaced · timing kept")).toBeVisible();
  await expect(blocks(page).first()).toContainText("It's the beat");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(blocks(page).first()).toContainText("It's the rhythm");
});

test("offline edits are kept, guarded on leave, and synced or restored later", async ({ page, context }) => {
  const url = await openReadyProject(page, "offline");

  await context.setOffline(true);
  await editText(page, 0, "It's the offline");
  await expect(page.getByText("Offline · kept in this browser")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("link", { name: "← Projects" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Some changes haven't synced yet" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Stay in editor" }).click();
  await expect(dialog).toBeHidden();

  // Back online: the pending change syncs by itself.
  await context.setOffline(false);
  await saved(page);

  // Offline again, then the tab closes before anything syncs: the next visit restores it.
  await context.setOffline(true);
  await editText(page, 2, "Every word lands fine");
  await expect(page.getByText("Offline · kept in this browser")).toBeVisible({ timeout: 10_000 });
  await page.close();
  await context.setOffline(false);

  const next = await context.newPage();
  // The unsynced edit waits in this browser…
  await next.goto("/projects");
  const drafts = await next.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("fala:editor-draft:")));
  expect(drafts).toHaveLength(1);
  // …and opening the editor restores and syncs it (the toast saying so is too brief to assert reliably).
  await next.goto(url);
  await expect(blocks(next).nth(2)).toContainText("Every word lands fine");
  await saved(next);
  await next.reload();
  await expect(blocks(next).first()).toContainText("It's the offline");
  await expect(blocks(next).nth(2)).toContainText("Every word lands fine");
});

test("a stale tab can't overwrite newer captions", async ({ page, context }) => {
  const url = await openReadyProject(page, "conflict");
  const other = await context.newPage();
  await other.goto(url);
  await expect(blocks(other).first()).toBeVisible();

  await editText(page, 0, "It's the first");
  await saved(page);

  await editText(other, 1, "that keeps us watching.");
  await expect(other.getByRole("status").filter({ hasText: "Changed in another tab" })).toBeVisible({ timeout: 10_000 });
  await expect(other.getByRole("button", { name: "Reload" })).toBeVisible();

  await page.reload();
  await expect(blocks(page).first()).toContainText("It's the first");
  await expect(blocks(page).nth(1)).toContainText("that keeps you watching.");
});
