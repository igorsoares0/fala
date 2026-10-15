"use client";

import { useId } from "react";
import {
  CAPTION_FONTS,
  CAPTION_FONT_WEIGHTS,
  HIGHLIGHT_COLORS,
  isPresetModified,
  PRESET_KEYS,
  PRESETS,
  TEXT_COLORS,
} from "@fala/shared";
import { CAPTION_FONT_FAMILY, CaptionSample } from "@/components/caption-sample";
import { useEditor } from "./editor-store";

const PREVIEW_WORDS = ["It's", "the", "rhythm"];

/** Presets and adjustments (FR-09, handoff §3 style panel). Every change shows in the preview at once and autosaves. */
export function StylePanel({ onClose, className = "" }: { onClose?: () => void; className?: string }) {
  const presetKey = useEditor((state) => state.presetKey);
  const style = useEditor((state) => state.styleConfig);
  const applyPreset = useEditor((state) => state.applyPreset);
  const updateStyle = useEditor((state) => state.updateStyle);
  const restorePreset = useEditor((state) => state.restorePreset);
  const modified = isPresetModified(presetKey, style);

  return (
    // Display (flex/hidden) comes from the editor shell, which moves this panel between column, drawer and tab.
    <section className={`min-h-0 flex-col gap-6 overflow-y-auto p-5 ${className}`} aria-label="Style">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold tracking-[-0.01em]">Style</h2>
        <div className="flex items-center gap-3">
          {modified && (
            <button type="button" onClick={restorePreset} className="text-[12.5px] text-muted underline underline-offset-[3px] hover:text-text">
              Restore default
            </button>
          )}
          {onClose && (
            // Only the 720–1099px drawer can be closed; the column and the mobile tab can't.
            <button
              type="button"
              onClick={onClose}
              aria-label="Close style panel"
              className="hidden size-8 place-items-center rounded-lg text-lg text-muted hover:bg-panel-2 hover:text-text min-[720px]:max-[1099px]:grid"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div role="radiogroup" aria-label="Preset" className="grid grid-cols-2 gap-2.5">
        {PRESET_KEYS.map((key) => {
          const selected = key === presetKey;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => applyPreset(key)}
              className={`flex flex-col gap-2 rounded-[11px] border-[1.5px] p-1.5 pb-2 text-left transition-colors ${
                selected ? "border-text bg-panel-2" : "border-transparent hover:bg-panel-1"
              }`}
            >
              <span className="relative aspect-[16/10] w-full overflow-hidden rounded-lg bg-[radial-gradient(80%_80%_at_50%_40%,#2a2723,#121110)] [container-type:inline-size]">
                <CaptionSample style={{ ...PRESETS[key].style, pos: "mid" }} words={PREVIEW_WORDS} activeIndex={2} />
              </span>
              <span className="flex items-center justify-between gap-1 px-1">
                <span className="text-[12.5px] font-semibold">{PRESETS[key].name}</span>
                {selected && modified && <span className="font-mono text-[10px] text-muted">edited</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-5">
        <span className="font-mono text-[11px] tracking-wide text-muted uppercase">Adjustments · {PRESETS[presetKey].name}</span>

        <Field label="Font">
          <Choice
            label="Font"
            columns={2}
            value={style.font}
            options={CAPTION_FONTS.map((font) => ({
              value: font,
              label: font,
              style: { fontFamily: CAPTION_FONT_FAMILY[font], fontWeight: CAPTION_FONT_WEIGHTS[font] },
            }))}
            onChange={(font) => updateStyle({ font })}
          />
        </Field>

        <Range label="Size" min={14} max={54} step={1} value={style.size} onChange={(size) => updateStyle({ size })} />

        <Field label="Spoken word highlight">
          <Choice
            label="Spoken word highlight"
            value={style.mode}
            options={[
              { value: "box", label: "Box" },
              { value: "text", label: "Color" },
              { value: "dim", label: "Reading" },
              { value: "none", label: "None" },
            ]}
            onChange={(mode) => updateStyle({ mode })}
          />
          {(style.mode === "box" || style.mode === "text") && (
            <Swatches label="Highlight color" value={style.hl} colors={HIGHLIGHT_COLORS} onChange={(hl) => updateStyle({ hl })} />
          )}
        </Field>

        <Field label="Text color">
          <Swatches label="Text color" value={style.color} colors={TEXT_COLORS} onChange={(color) => updateStyle({ color })} />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Toggle label="All caps" checked={style.upper} onChange={(upper) => updateStyle({ upper })} />
          <Toggle label="Outline" checked={style.outline} onChange={(outline) => updateStyle({ outline })} />
          <Toggle label="Shadow" checked={style.shadow} onChange={(shadow) => updateStyle({ shadow })} />
          <Toggle label="Bar" checked={style.plate} onChange={(plate) => updateStyle({ plate })} />
        </div>

        {style.outline && (
          <Range label="Outline thickness" min={1} max={6} step={0.5} value={style.ow} onChange={(ow) => updateStyle({ ow })} />
        )}

        <Field label="Position">
          <Choice
            label="Position"
            value={style.pos}
            options={[
              { value: "top", label: "Top" },
              { value: "mid", label: "Middle" },
              { value: "bottom", label: "Bottom" },
            ]}
            onChange={(pos) => updateStyle({ pos })}
          />
        </Field>

        <Field label="Word entrance">
          <Choice
            label="Word entrance"
            value={style.anim}
            options={[
              { value: "none", label: "Instant" },
              { value: "pop", label: "Soft pop" },
            ]}
            onChange={(anim) => updateStyle({ anim })}
          />
        </Field>

        <Stepper label="Words per block" min={1} max={10} value={style.maxW} onChange={(maxW) => updateStyle({ maxW })} />
      </div>
    </section>
  );
}

const fieldLabel = "text-[13px] font-semibold text-text";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className={fieldLabel} aria-hidden>
        {label}
      </span>
      {children}
    </div>
  );
}

/** Segmented control (or chip grid) built as a radio group. */
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  columns,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; style?: React.CSSProperties }[];
  onChange: (value: T) => void;
  columns?: number;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={columns ? "grid gap-1.5" : "flex rounded-[9px] bg-panel-1 p-[3px]"}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            style={option.style}
            className={
              columns
                ? `truncate rounded-[9px] border px-2.5 py-2 text-[13px] transition-colors ${
                    selected ? "border-text bg-panel-2 text-text" : "border-line-button text-muted hover:text-text"
                  }`
                : `flex-1 rounded-[7px] px-2 py-1.5 text-[12.5px] font-semibold transition-colors ${
                    selected ? "bg-text text-ink" : "text-muted hover:text-text"
                  }`
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Swatches({
  label,
  value,
  colors,
  onChange,
}: {
  label: string;
  value: string;
  colors: readonly { value: string; name: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2.5">
      {colors.map((color) => {
        const selected = color.value.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={color.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={color.name}
            title={color.name}
            onClick={() => onChange(color.value)}
            className="size-7 rounded-full border border-[rgba(236,230,218,.2)]"
            style={{
              background: color.value,
              boxShadow: selected ? "0 0 0 2px var(--color-panel-1), 0 0 0 4px var(--color-text)" : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-2 rounded-[9px] border px-3 py-2 text-[13px] transition-colors has-focus-visible:outline-2 ${
        checked ? "border-text bg-panel-2 text-text" : "border-line-button text-muted hover:text-text"
      }`}
    >
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="sr-only" />
      <span aria-hidden className={`size-2 rounded-full ${checked ? "bg-accent" : "bg-[rgba(236,230,218,.25)]"}`} />
    </label>
  );
}

function Range({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className={fieldLabel}>
          {label}
        </label>
        <span className="font-mono text-[11.5px] text-muted tabular-nums">{value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--color-accent)]"
      />
    </div>
  );
}

function Stepper({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const button = "grid size-8 place-items-center rounded-lg border border-line-button font-mono text-base text-text hover:bg-panel-1 disabled:opacity-30";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={fieldLabel} id={id}>
        {label}
      </span>
      <div className="flex items-center gap-2" role="group" aria-labelledby={id}>
        <button type="button" className={button} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}>
          −
        </button>
        <output className="w-6 text-center font-mono text-sm tabular-nums" aria-live="polite">
          {value}
        </output>
        <button type="button" className={button} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>
          +
        </button>
      </div>
    </div>
  );
}
