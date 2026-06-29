// Pure signal computation.
//
// Takes a PerceptionFrame and produces a map of signal scores in [0, 1].
// Signal names are kept compatible with the first leg's WebSocket `signals`
// block so an instruction set is the natural inverse of a detection output.

import { BBox, DetectedObject, PerceptionFrame, Point, SignalScores } from "../types";

/** Tunable falloff distances (normalized units). */
export const SIGNAL_CONST = {
  /** Distance at which hand_bottle_proximity falls to 0. */
  HAND_BOTTLE_FAR: 0.25,
  /** Distance at which neck_hand_proximity falls to 0. */
  TOP_REGION_FAR: 0.2,
  /** Distance at which mouth_bottle_proximity falls to 0. */
  MOUTH_FAR: 0.2,
  /** Distance at which mouth_object_proximity falls to 0 (objects sit further than a bottle neck). */
  OBJECT_MOUTH_FAR: 0.28,
};

/** Hand landmark indices we treat as "the hand" for proximity. */
const HAND_POINTS = [0, 4, 8, 5, 9, 12]; // wrist, thumb tip, index tip, MCPs

/** Object labels treated as a bottle/cup for the named bottle signals. */
const BOTTLE_LABELS = ["bottle", "water bottle", "cup"];

/** Labels excluded when picking the "primary" object for generic signals. */
const NON_TARGET_LABELS = ["person"];

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function bboxRegionPoint(b: BBox, region?: string): Point {
  const cx = b.x + b.w / 2;
  if (region === "top") return { x: cx, y: b.y + b.h * 0.15 };
  if (region === "bottom") return { x: cx, y: b.y + b.h * 0.85 };
  return { x: cx, y: b.y + b.h / 2 };
}

/** Distance from a point to a bbox (0 if the point is inside). */
export function distPointToBBox(p: Point, b: BBox): number {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

/** Highest-scoring object matching a bottle-like label, or null. */
export function findBottle(frame: PerceptionFrame): DetectedObject | null {
  let best: DetectedObject | null = null;
  for (const o of frame.objects) {
    if (BOTTLE_LABELS.includes(o.label.toLowerCase())) {
      if (!best || o.score > best.score) best = o;
    }
  }
  return best;
}

/**
 * Highest-scoring "thing the user is interacting with" — the most confident
 * detected object that isn't a person. Used by the object-agnostic signals so
 * an instruction set can target any object, not just bottles.
 */
export function findPrimaryObject(frame: PerceptionFrame): DetectedObject | null {
  let best: DetectedObject | null = null;
  for (const o of frame.objects) {
    if (NON_TARGET_LABELS.includes(o.label.toLowerCase())) continue;
    if (!best || o.score > best.score) best = o;
  }
  return best;
}

function nearestHandDistToBBox(frame: PerceptionFrame, bbox: BBox): number | null {
  let min = Infinity;
  for (const h of frame.hands) {
    for (const idx of HAND_POINTS) {
      const p = h.landmarks[idx];
      if (!p) continue;
      const d = distPointToBBox(p, bbox);
      if (d < min) min = d;
    }
  }
  return min === Infinity ? null : min;
}

function nearestHandDistToPoint(frame: PerceptionFrame, pt: Point): number | null {
  let min = Infinity;
  for (const h of frame.hands) {
    for (const idx of HAND_POINTS) {
      const p = h.landmarks[idx];
      if (!p) continue;
      const d = dist(p, pt);
      if (d < min) min = d;
    }
  }
  return min === Infinity ? null : min;
}

/**
 * How horizontal a bbox is, in [0, 1]. Uses pixel aspect (normalized w/h are not
 * directly comparable because the frame itself is wider than tall). An upright
 * bottle is tall (low score); a bottle tilted toward the mouth becomes wide.
 */
export function tiltScore(b: BBox, frameW: number, frameH: number): number {
  const pxW = b.w * (frameW || 1);
  const pxH = b.h * (frameH || 1);
  const denom = pxW + pxH;
  if (denom <= 0) return 0;
  const ratio = pxW / denom; // ~0.3 upright, ~0.5 square/tilting, >0.6 horizontal
  return clamp01((ratio - 0.4) / 0.25);
}

/**
 * Compute all known signals for a frame.
 *
 * - hand_bottle_proximity:  nearest hand point to the bottle bbox.
 * - neck_hand_proximity:    nearest hand point to the bottle's top region (cap area).
 * - mouth_bottle_proximity: mouth distance to the *nearest edge* of the bottle bbox
 *                           (orientation-independent — works when the bottle tilts).
 * - bottle_tilt:            how horizontal the bottle is.
 * - drinking:               composite — bottle at the mouth, tilting horizontal.
 * - wrist_rotation:         reserved (0 in v1).
 */
export function computeSignals(frame: PerceptionFrame): SignalScores {
  const s: SignalScores = {
    // Named bottle/cup signals (parity with the first leg).
    hand_bottle_proximity: 0,
    neck_hand_proximity: 0,
    mouth_bottle_proximity: 0,
    bottle_tilt: 0,
    drinking: 0,
    wrist_rotation: 0,
    // Object-agnostic signals — work against any detected object, so an
    // instruction set can target anything the detector knows, not just bottles.
    hand_object_proximity: 0,
    object_top_hand_proximity: 0,
    mouth_object_proximity: 0,
  };

  const bottle = findBottle(frame);
  if (bottle) {
    const dHand = nearestHandDistToBBox(frame, bottle.bbox);
    if (dHand != null) {
      s.hand_bottle_proximity = clamp01(1 - dHand / SIGNAL_CONST.HAND_BOTTLE_FAR);
    }
    const top = bboxRegionPoint(bottle.bbox, "top");
    const dTop = nearestHandDistToPoint(frame, top);
    if (dTop != null) {
      s.neck_hand_proximity = clamp01(1 - dTop / SIGNAL_CONST.TOP_REGION_FAR);
    }
    if (frame.mouth) {
      // Distance to the nearest edge of the bbox (0 if the mouth is inside it),
      // so it stays high regardless of how the bottle is oriented.
      const dMouth = distPointToBBox(frame.mouth, bottle.bbox);
      s.mouth_bottle_proximity = clamp01(1 - dMouth / SIGNAL_CONST.MOUTH_FAR);
    }
    s.bottle_tilt = tiltScore(bottle.bbox, frame.width, frame.height);
    // "Drinking" = bottle at the mouth, weighted mostly by proximity with a tilt
    // bonus so a horizontal bottle near the lips reads as a confident drink.
    s.drinking = clamp01(0.7 * s.mouth_bottle_proximity + 0.3 * s.bottle_tilt);
  }

  const target = findPrimaryObject(frame);
  if (target) {
    const dHand = nearestHandDistToBBox(frame, target.bbox);
    if (dHand != null) {
      s.hand_object_proximity = clamp01(1 - dHand / SIGNAL_CONST.HAND_BOTTLE_FAR);
    }
    const top = bboxRegionPoint(target.bbox, "top");
    const dTop = nearestHandDistToPoint(frame, top);
    if (dTop != null) {
      s.object_top_hand_proximity = clamp01(1 - dTop / SIGNAL_CONST.TOP_REGION_FAR);
    }
    if (frame.mouth) {
      const dMouth = distPointToBBox(frame.mouth, target.bbox);
      s.mouth_object_proximity = clamp01(1 - dMouth / SIGNAL_CONST.OBJECT_MOUTH_FAR);
    }
  }

  return s;
}
