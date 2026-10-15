import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@fala/db";
import { captionTrackSchema, PRESETS, segmentWords } from "@fala/shared";
import { getProject } from "./projects";
import { saveProjectStyle } from "./style";

const owner = { id: `test-st-owner-${randomUUID()}`, name: "Owner", email: `st-owner-${randomUUID()}@test.local` };
const intruder = { id: `test-st-intruder-${randomUUID()}`, name: "Intruder", email: `st-intruder-${randomUUID()}@test.local` };

const words = "one two three four five six".split(" ").map((text, index) => ({
  text,
  startMs: index * 250,
  endMs: index * 250 + 200,
}));

beforeAll(async () => {
  await db.user.createMany({ data: [owner, intruder] });
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [owner.id, intruder.id] } } });
  await db.$disconnect();
});

/** A READY project segmented with the default style (3 words per block). */
async function readyProject() {
  const blocks = segmentWords(words, { maxWords: 3, durationMs: 2000, language: "en" });
  const project = await db.project.create({
    data: { userId: owner.id, name: "Styled", status: "READY", durationMs: 2000, captionSample: ["one", "two", "three"] },
  });
  await db.captionTrack.create({ data: { projectId: project.id, language: "en", words, blocks } });
  return project.id;
}

const trackOf = async (projectId: string) => {
  const row = await db.captionTrack.findUniqueOrThrow({ where: { projectId } });
  return { version: row.version, ...captionTrackSchema.parse(row) };
};

describe("saveProjectStyle", () => {
  it("projects use the default style until one is saved", async () => {
    const id = await readyProject();
    expect((await getProject(owner.id, id))?.style).toEqual({ presetKey: "bold", style: PRESETS.bold.style });
  });

  it("saves the style for the owner only, creating then updating it", async () => {
    const id = await readyProject();
    const word = { presetKey: "word" as const, style: { ...PRESETS.word.style, maxW: 3 } };

    expect(await saveProjectStyle(intruder.id, id, word)).toMatchObject({ ok: false });
    expect(await db.projectStyle.count({ where: { projectId: id } })).toBe(0);

    expect(await saveProjectStyle(owner.id, id, word)).toEqual({ ok: true });
    const bigger = { ...word, style: { ...word.style, size: 40 } };
    expect(await saveProjectStyle(owner.id, id, bigger)).toEqual({ ok: true });

    expect((await getProject(owner.id, id))?.style).toEqual(bigger);
    // Same words per block: the captions are untouched.
    expect((await trackOf(id)).version).toBe(1);
  });

  it("leaves the captions alone: the editor re-segments and saves them itself", async () => {
    const id = await readyProject();
    await saveProjectStyle(owner.id, id, { presetKey: "bold", style: { ...PRESETS.bold.style, maxW: 1 } });

    const track = await trackOf(id);
    expect(track.version).toBe(1);
    expect(track.blocks).toHaveLength(2);
  });
});
