"use client";

import { cropAxis, cropRect, FRAME_ASPECTS, FRAME_FORMATS, isTallFrame } from "@fala/shared";
import { useEditor } from "./editor-store";
import { Choice, Field, Range, Toggle } from "./style-panel";

const FORMAT_OPTIONS = FRAME_ASPECTS.map((aspect) => ({ value: aspect, label: FRAME_FORMATS[aspect].label }));

/**
 * The shape of the exported video: the original, or an aspect ratio the video is
 * cropped to. When the crop cuts something off, "Framing" slides it along the cut
 * axis; full-screen vertical formats can show where the apps' interface will sit.
 */
export function FormatSection({ width, height }: { width: number | null; height: number | null }) {
  const frame = useEditor((state) => state.frame);
  const showSafeZones = useEditor((state) => state.showSafeZones);
  const setFrameAspect = useEditor((state) => state.setFrameAspect);
  const setFrameFocus = useEditor((state) => state.setFrameFocus);
  const setShowSafeZones = useEditor((state) => state.setShowSafeZones);

  const axis = width && height ? cropAxis(width, height, frame) : null;
  const crop = width && height ? cropRect(width, height, frame) : null;
  const tall = crop ? isTallFrame(crop.width, crop.height) : false;

  return (
    <div className="flex flex-col gap-3">
      <Field label="Format">
        <Choice label="Format" columns={3} value={frame.aspect} options={FORMAT_OPTIONS} onChange={setFrameAspect} />
        <p className="text-[12.5px] text-pretty text-muted" data-testid="format-hint">
          {FRAME_FORMATS[frame.aspect].platforms}
          {frame.aspect !== "original" && !axis && " · your video already has this shape"}
        </p>
      </Field>
      {axis && (
        <Range
          label={axis === "x" ? "Framing · left ↔ right" : "Framing · top ↔ bottom"}
          min={0}
          max={100}
          step={1}
          value={Math.round(frame.focus * 100)}
          onChange={(value) => setFrameFocus(value / 100)}
        />
      )}
      {tall && <Toggle label="Safe zones" checked={showSafeZones} onChange={setShowSafeZones} />}
    </div>
  );
}
