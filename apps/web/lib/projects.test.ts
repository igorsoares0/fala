import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@fala/db";
import { createProject, deleteProject, getProject, listProjects, renameProject } from "./projects";

const owner = { id: `test-owner-${randomUUID()}`, name: "Owner", email: `owner-${randomUUID()}@test.local` };
const intruder = { id: `test-intruder-${randomUUID()}`, name: "Intruder", email: `intruder-${randomUUID()}@test.local` };

beforeAll(async () => {
  await db.user.createMany({ data: [owner, intruder] });
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [owner.id, intruder.id] } } });
  await db.$disconnect();
});

describe("project ownership", () => {
  it("lists only the caller's projects, newest first", async () => {
    const first = await createProject(owner.id, "First");
    const second = await createProject(owner.id, "Second");
    await createProject(intruder.id, "Not yours");

    const projects = await listProjects(owner.id);
    expect(projects.map((p) => p.id)).toEqual([second.id, first.id]);
    expect(projects.every((p) => p.status === "CREATED")).toBe(true);
  });

  it("hides another user's project as if it didn't exist", async () => {
    const { id } = await createProject(owner.id, "Private");
    expect(await getProject(intruder.id, id)).toBeNull();
    expect(await getProject(owner.id, id)).toMatchObject({ id, name: "Private" });
  });

  it("refuses to rename or delete another user's project", async () => {
    const { id } = await createProject(owner.id, "Keep me");

    expect(await renameProject(intruder.id, id, "Hijacked")).toBe(false);
    expect(await deleteProject(intruder.id, id)).toBe(false);

    const project = await getProject(owner.id, id);
    expect(project?.name).toBe("Keep me");
  });

  it("renames the caller's project", async () => {
    const { id } = await createProject(owner.id, "Old name");
    expect(await renameProject(owner.id, id, "New name")).toBe(true);
    expect((await getProject(owner.id, id))?.name).toBe("New name");
  });

  it("soft-deletes: the project disappears and is marked for cleanup", async () => {
    const { id } = await createProject(owner.id, "Delete me");
    expect(await deleteProject(owner.id, id)).toBe(true);

    expect(await getProject(owner.id, id)).toBeNull();
    expect((await listProjects(owner.id)).some((p) => p.id === id)).toBe(false);
    expect(await renameProject(owner.id, id, "Back from the dead")).toBe(false);
    expect(await deleteProject(owner.id, id)).toBe(false);

    const row = await db.project.findUnique({ where: { id } });
    expect(row?.status).toBe("DELETION_PENDING");
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });
});
