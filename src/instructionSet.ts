// Loading and validation for instruction-set JSON.

import { Anchor, InstructionSet, LocalizedString, Step } from "./types";

/** Bundled sample instruction sets, selectable from the header. */
export interface SampleRef {
  id: string;
  name: LocalizedString;
  url: string;
}

export const SAMPLES: SampleRef[] = [
  { id: "skill-share", name: { en: "Skill share", ja: "スキルシェア" }, url: "instruction-sets/skill-share.json" },
];

const DEFAULT_URL = SAMPLES[0].url;

function isLocalized(v: unknown): boolean {
  return !!v && typeof v === "object" && typeof (v as Record<string, unknown>).en === "string";
}

function validateAnchor(a: unknown): a is Anchor {
  if (!a || typeof a !== "object") return false;
  const anchor = a as Record<string, unknown>;
  return (
    (anchor.type === "object" || anchor.type === "landmark") &&
    typeof anchor.label === "string"
  );
}

function validateStep(s: unknown): s is Step {
  if (!s || typeof s !== "object") return false;
  const step = s as Record<string, unknown>;
  const cw = step.complete_when as Record<string, unknown> | undefined;
  return (
    typeof step.id === "string" &&
    isLocalized(step.title) &&
    isLocalized(step.instruction) &&
    validateAnchor(step.anchor) &&
    (step.pointer === "arrow" || step.pointer === "highlight") &&
    !!cw &&
    typeof cw.signal === "string" &&
    typeof cw.threshold === "number" &&
    typeof cw.hold_frames === "number"
  );
}

/** Parse and validate an instruction set, throwing on malformed input. */
export function parseInstructionSet(data: unknown): InstructionSet {
  if (!data || typeof data !== "object") throw new Error("Instruction set must be an object");
  const set = data as Record<string, unknown>;
  if (typeof set.task_id !== "string") throw new Error("Missing task_id");
  if (!isLocalized(set.title)) throw new Error("Missing localized title");
  if (!Array.isArray(set.steps) || set.steps.length === 0) throw new Error("Missing steps");
  set.steps.forEach((s, i) => {
    if (!validateStep(s)) throw new Error(`Invalid step at index ${i}`);
  });
  return data as InstructionSet;
}

export async function loadInstructionSetUrl(url: string): Promise<InstructionSet> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return parseInstructionSet(await res.json());
}

export async function loadDefaultInstructionSet(): Promise<InstructionSet> {
  return loadInstructionSetUrl(DEFAULT_URL);
}

export async function readInstructionSetFile(file: File): Promise<InstructionSet> {
  const text = await file.text();
  return parseInstructionSet(JSON.parse(text));
}
