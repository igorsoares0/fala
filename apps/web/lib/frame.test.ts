import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@fala/db";
import { ORIGINAL_FRAME } from "@fala/shared";
import { saveFrame } from "./frame";
import { getProject } from "./projects";

const owner = { id: `test-frame-owner-${randomUUID()}`, name: "Owner", email: `frame-owner-${randomUUID()}@test.local` };
const intruder = { id: `test-frame-intruder-${randomUUID()}`, name: "Intruder", email: `frame-intruder-${randomUUID()}@test.local` };

beforeAll(async () => {
  await db.user.createMany({ data: [owner, intruder] });
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [owner.id, intruder.id] } } });
  await db.$disconnect();
});

const readyProject = async () =>
  (await db.project.create({ data: { userId: owner.id, name: "Framed", status: "READY", durationMs: 5000, width: 1920, height: 1080 } })).id;

const stored = (id: string) => db.project.findUniqueOrThrow({ where: { id }, select: { frameAspect: true, frameFocus: true } });

describe("saveFrame", () => {
  it("projects export as uploaded until a frame is saved", async () => {
    const id = await readyProject();
    expect((await getProject(owner.id, id))?.frame).toEqual(ORIGINAL_FRAME);
    expect(await stored(id)).toEqual({ frameAspect: null, frameFocus: null });
  });

  it("saves the frame for the owner only", async () => {
    const id = await readyProject();
    const frame = { aspect: "9:16" as const, focus: 0.8 };

    expect(await saveFrame(intruder.id, id, frame)).toMatchObject({ ok: false });
    expect(await stored(id)).toEqual({ frameAspect: null, frameFocus: null });

    expect(await saveFrame(owner.id, id, frame)).toEqual({ ok: true, frame });
    expect(await stored(id)).toEqual({ frameAspect: "9:16", frameFocus: 0.8 });
    expect((await getProject(owner.id, id))?.frame).toEqual(frame);
  });

  it("stores the original frame as none, whatever focus comes with it", async () => {
    const id = await readyProject();
    await saveFrame(owner.id, id, { aspect: "1:1", focus: 0.2 });
    expect(await saveFrame(owner.id, id, { aspect: "original", focus: 0.2 })).toEqual({ ok: true, frame: ORIGINAL_FRAME });
    expect(await stored(id)).toEqual({ frameAspect: null, frameFocus: null });
  });

  it("falls back to the original when a stored frame no longer validates", async () => {
    const id = await readyProject();
    await db.project.update({ where: { id }, data: { frameAspect: "3:2", frameFocus: 0.5 } });
    expect((await getProject(owner.id, id))?.frame).toEqual(ORIGINAL_FRAME);
  });
});
