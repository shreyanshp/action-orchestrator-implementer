// Pure anchor resolution.
//
// Resolves a step's Anchor to a normalized point in the current frame, or null
// if the target is not currently detected.

import { Anchor, PerceptionFrame, Point } from "../types";
import { bboxRegionPoint, findBottle } from "./signals";

const BOTTLE_LABELS = ["bottle", "water bottle", "cup"];

export function resolveAnchor(anchor: Anchor, frame: PerceptionFrame): Point | null {
  if (anchor.type === "object") {
    const label = anchor.label.toLowerCase();
    // Bottle-like labels go through findBottle (handles synonyms + best score).
    // Any other label is matched directly against detected objects.
    const obj = BOTTLE_LABELS.includes(label)
      ? findBottle(frame)
      : frame.objects.find((o) => o.label.toLowerCase() === label) ?? null;
    if (!obj) return null;
    return bboxRegionPoint(obj.bbox, anchor.region);
  }

  if (anchor.type === "landmark") {
    const label = anchor.label.toLowerCase();
    if (label === "mouth") return frame.mouth;
    if (label === "wrist") return frame.hands[0]?.landmarks[0] ?? null;
    return null;
  }

  return null;
}
