import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@fala/db";
import { editBlockText, splitBlock, type CaptionTrack } from "@fala/shared";
import { saveCaptions } from "./captions";
import { getCaptionTrack } from "./transcription";

const owner = { id: `test-cap-owner-${randomUUID()}`, name: "Owner", email: `cap-owner-${randomUUID()}@test.local` };
const intruder = { id: `test-cap-intruder-${randomUUID()}`, name: "Intruder", email: `cap-intruder-${randomUUID()}@test.local` };

const original: CaptionTrack = {
  language: "en",
  words: ["Hello", "there,", "friend."].map((text, index) => ({ text, startMs: index * 300, endMs: index * 300 + 250 })),
  blocks: [{ id: "b1", wordStart: 0, wordEnd: 2, startMs: 0, endMs: 900 }],
};

beforeAll(async () => {
  await db.user.createMany({ data: [owner, intruder] });
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [owner.id, intruder.id] } } });
  await db.$disconnect();
});

async function readyProject() {
  const project = await db.project.create({
    data: { userId: owner.id, name: "Captions", status: "READY", durationMs: 1000, captionSample: ["Hello", "there,", "friend."] },
  });
  await db.captionTrack.create({ data: { projectId: project.id, language: "en", words: original.words, blocks: original.blocks } });
  return project.id;
}

const save = (userId: string, id: string, track: CaptionTrack, baseVersion: number) =>
  saveCaptions(userId, id, { baseVersion, words: track.words, blocks: track.blocks });

describe("saveCaptions", () => {
  it("saves the owner's edits and bumps the version", async () => {
    const id = await readyProject();
    const edited = splitBlock(editBlockText(original, 0, "Hi there, pal."), 0, 0);

    expect(await save(intruder.id, id, edited, 1)).toMatchObject({ ok: false, conflict: false });
    expect(await save(owner.id, id, edited, 1)).toEqual({ ok: true, version: 2 });

    expect(await getCaptionTrack(owner.id, id)).toEqual({ version: 2, track: edited });
    expect((await db.project.findUniqueOrThrow({ where: { id } })).captionSample).toEqual(["Hi"]);
    // The provider's original transcript is a separate record and stays as it was.
  });

  it("refuses a save based on an older version, without writing anything", async () => {
    const id = await readyProject();
    expect(await save(owner.id, id, editBlockText(original, 0, "First tab wins"), 1)).toEqual({ ok: true, version: 2 });

    const stale = await save(owner.id, id, editBlockText(original, 0, "Second tab loses"), 1);
    expect(stale).toMatchObject({ ok: false, conflict: true, version: 2, current: { words: [{ text: "First" }, {}, {}] } });
    expect((await getCaptionTrack(owner.id, id))?.track.words[0].text).toBe("First");
  });

  it("rejects invalid documents and captions past the end of the video", async () => {
    const id = await readyProject();
    const gap = { ...original, blocks: [{ ...original.blocks[0], wordStart: 1 }] };
    expect(await save(owner.id, id, gap, 1)).toMatchObject({ ok: false, conflict: false });

    const tooLate = { ...original, blocks: [{ ...original.blocks[0], endMs: 1500 }] };
    expect(await save(owner.id, id, tooLate, 1)).toMatchObject({ ok: false, conflict: false });
    expect((await getCaptionTrack(owner.id, id))?.version).toBe(1);
  });
});
