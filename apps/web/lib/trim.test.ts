import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@fala/db";
import { MIN_TRIM_MS } from "@fala/shared";
import { getProject } from "./projects";
import { saveTrim } from "./trim";

const owner = { id: `test-trim-owner-${randomUUID()}`, name: "Owner", email: `trim-owner-${randomUUID()}@test.local` };
const intruder = { id: `test-trim-intruder-${randomUUID()}`, name: "Intruder", email: `trim-intruder-${randomUUID()}@test.local` };

const DURATION_MS = 10_000;

beforeAll(async () => {
  await db.user.createMany({ data: [owner, intruder] });
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [owner.id, intruder.id] } } });
  await db.$disconnect();
});

const readyProject = async (durationMs: number | null = DURATION_MS) =>
  (await db.project.create({ data: { userId: owner.id, name: "Trimmed", status: "READY", durationMs } })).id;

const stored = (id: string) => db.project.findUniqueOrThrow({ where: { id }, select: { trimStartMs: true, trimEndMs: true } });

describe("saveTrim", () => {
  it("projects keep the whole video until a trim is saved", async () => {
    const id = await readyProject();
    expect((await getProject(owner.id, id))?.trim).toEqual({ startMs: 0, endMs: DURATION_MS });
    expect(await stored(id)).toEqual({ trimStartMs: null, trimEndMs: null });
  });

  it("saves the trim for the owner only", async () => {
    const id = await readyProject();
    const trim = { startMs: 1500, endMs: 8200 };

    expect(await saveTrim(intruder.id, id, trim)).toMatchObject({ ok: false });
    expect(await stored(id)).toEqual({ trimStartMs: null, trimEndMs: null });

    expect(await saveTrim(owner.id, id, trim)).toEqual({ ok: true, trim });
    expect(await stored(id)).toEqual({ trimStartMs: 1500, trimEndMs: 8200 });
    expect((await getProject(owner.id, id))?.trim).toEqual(trim);
    expect(await getProject(intruder.id, id)).toBeNull();
  });

  it("keeps the trim inside the video and at least the minimum length", async () => {
    const id = await readyProject();
    expect(await saveTrim(owner.id, id, { startMs: 4000, endMs: 99_000 })).toEqual({ ok: true, trim: { startMs: 4000, endMs: DURATION_MS } });
    expect(await saveTrim(owner.id, id, { startMs: 5000, endMs: 5100 })).toEqual({
      ok: true,
      trim: { startMs: 5100 - MIN_TRIM_MS, endMs: 5100 },
    });
  });

  it("stores a trim that covers the whole video as none", async () => {
    const id = await readyProject();
    await saveTrim(owner.id, id, { startMs: 1000, endMs: 5000 });
    expect(await saveTrim(owner.id, id, { startMs: 0, endMs: DURATION_MS })).toMatchObject({ ok: true });
    expect(await stored(id)).toEqual({ trimStartMs: null, trimEndMs: null });
  });

  it("refuses a project whose video has no known length yet", async () => {
    const id = await readyProject(null);
    expect(await saveTrim(owner.id, id, { startMs: 0, endMs: 1000 })).toMatchObject({ ok: false });
    expect((await getProject(owner.id, id))?.trim).toBeNull();
  });
});
