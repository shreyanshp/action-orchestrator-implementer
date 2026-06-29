import { describe, it, expect } from "vitest";
import { computeSignals, distPointToBBox, findBottle, findPrimaryObject, tiltScore, clamp01 } from "./signals";
import { PerceptionFrame, Hand } from "../types";

function hand(points: Record<number, [number, number]>): Hand {
  const landmarks = Array.from({ length: 21 }, (_, i) => {
    const p = points[i];
    return p ? { x: p[0], y: p[1] } : { x: 0, y: 0 };
  });
  return { handedness: "Right", landmarks };
}

function frame(partial: Partial<PerceptionFrame>): PerceptionFrame {
  return { hands: [], mouth: null, objects: [], width: 1280, height: 720, ...partial };
}

describe("clamp01", () => {
  it("clamps to [0,1]", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
  });
});

describe("distPointToBBox", () => {
  const box = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };
  it("is 0 inside the box", () => {
    expect(distPointToBBox({ x: 0.5, y: 0.5 }, box)).toBe(0);
  });
  it("is positive outside the box", () => {
    expect(distPointToBBox({ x: 0.4, y: 0.1 }, box)).toBeCloseTo(0.3, 5);
  });
});

describe("findBottle", () => {
  it("returns null when no bottle present", () => {
    expect(findBottle(frame({ objects: [{ label: "chair", score: 0.9, bbox: { x: 0, y: 0, w: 1, h: 1 } }] }))).toBeNull();
  });
  it("picks the highest-scoring bottle-like object", () => {
    const f = frame({
      objects: [
        { label: "bottle", score: 0.4, bbox: { x: 0, y: 0, w: 0.1, h: 0.1 } },
        { label: "cup", score: 0.8, bbox: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 } },
      ],
    });
    expect(findBottle(f)?.label).toBe("cup");
  });
});

describe("findPrimaryObject", () => {
  it("ignores person and picks the highest-scoring object", () => {
    const f = frame({
      objects: [
        { label: "person", score: 0.99, bbox: { x: 0, y: 0, w: 1, h: 1 } },
        { label: "cell phone", score: 0.7, bbox: { x: 0.4, y: 0.4, w: 0.1, h: 0.2 } },
      ],
    });
    expect(findPrimaryObject(f)?.label).toBe("cell phone");
  });
  it("returns null with only a person present", () => {
    expect(findPrimaryObject(frame({ objects: [{ label: "person", score: 0.9, bbox: { x: 0, y: 0, w: 1, h: 1 } }] }))).toBeNull();
  });
});

describe("tiltScore", () => {
  it("is low for an upright (tall) bottle", () => {
    expect(tiltScore({ x: 0.4, y: 0.2, w: 0.08, h: 0.4 }, 1280, 720)).toBe(0);
  });
  it("is high for a horizontal (wide) bottle", () => {
    expect(tiltScore({ x: 0.3, y: 0.4, w: 0.3, h: 0.1 }, 1280, 720)).toBeGreaterThan(0.9);
  });
});

describe("computeSignals (drinking)", () => {
  it("registers drinking when a tilted bottle is at the mouth", () => {
    const f = frame({
      objects: [{ label: "bottle", score: 0.9, bbox: { x: 0.4, y: 0.4, w: 0.3, h: 0.1 } }],
      mouth: { x: 0.6, y: 0.45 }, // inside the horizontal bbox
    });
    const s = computeSignals(f);
    expect(s.bottle_tilt).toBeGreaterThan(0.9);
    expect(s.mouth_bottle_proximity).toBe(1);
    expect(s.drinking).toBeGreaterThan(0.6);
  });

  it("does not register drinking when no mouth is visible", () => {
    const f = frame({
      objects: [{ label: "bottle", score: 0.9, bbox: { x: 0.4, y: 0.4, w: 0.3, h: 0.1 } }],
    });
    expect(computeSignals(f).drinking).toBeLessThan(0.6);
  });
});

describe("computeSignals (generic object signals)", () => {
  it("scores hand_object_proximity for a non-bottle object", () => {
    const f = frame({
      objects: [{ label: "cell phone", score: 0.8, bbox: { x: 0.4, y: 0.4, w: 0.15, h: 0.25 } }],
      hands: [hand({ 0: [0.47, 0.5] })], // wrist inside the phone bbox
    });
    expect(computeSignals(f).hand_object_proximity).toBe(1);
    expect(computeSignals(f).hand_bottle_proximity).toBe(0); // bottle signals stay 0
  });

  it("scores mouth_object_proximity when the object is near the mouth", () => {
    const f = frame({
      objects: [{ label: "cell phone", score: 0.8, bbox: { x: 0.45, y: 0.3, w: 0.1, h: 0.2 } }],
      mouth: { x: 0.5, y: 0.4 }, // near the object center
    });
    expect(computeSignals(f).mouth_object_proximity).toBeGreaterThan(0.8);
  });
});

describe("computeSignals", () => {
  it("returns all-zero signals with no bottle", () => {
    const s = computeSignals(frame({}));
    expect(s.hand_bottle_proximity).toBe(0);
    expect(s.mouth_bottle_proximity).toBe(0);
  });

  it("scores high hand_bottle_proximity when a hand is on the bottle", () => {
    const f = frame({
      objects: [{ label: "bottle", score: 0.9, bbox: { x: 0.4, y: 0.4, w: 0.2, h: 0.3 } }],
      hands: [hand({ 0: [0.5, 0.5] })], // wrist inside the bbox
    });
    const s = computeSignals(f);
    expect(s.hand_bottle_proximity).toBe(1);
  });

  it("scores low hand_bottle_proximity when the hand is far away", () => {
    // Bottle centered so the helper's default (0,0) landmarks are also far.
    const f = frame({
      objects: [{ label: "bottle", score: 0.9, bbox: { x: 0.45, y: 0.45, w: 0.1, h: 0.1 } }],
      hands: [hand({ 0: [0.95, 0.95] })],
    });
    expect(computeSignals(f).hand_bottle_proximity).toBe(0);
  });

  it("scores high mouth_bottle_proximity when bottle top is near the mouth", () => {
    const f = frame({
      objects: [{ label: "bottle", score: 0.9, bbox: { x: 0.45, y: 0.3, w: 0.1, h: 0.3 } }],
      mouth: { x: 0.5, y: 0.345 }, // near the bottle top region point
    });
    expect(computeSignals(f).mouth_bottle_proximity).toBeGreaterThan(0.9);
  });
});
