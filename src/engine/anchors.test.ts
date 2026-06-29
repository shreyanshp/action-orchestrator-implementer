import { describe, it, expect } from "vitest";
import { resolveAnchor } from "./anchors";
import { PerceptionFrame } from "../types";

function frame(partial: Partial<PerceptionFrame>): PerceptionFrame {
  return { hands: [], mouth: null, pose: null, objects: [], width: 1280, height: 720, ...partial };
}

describe("resolveAnchor", () => {
  it("resolves an object anchor to the bbox center", () => {
    const f = frame({ objects: [{ label: "bottle", score: 0.9, bbox: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 } }] });
    expect(resolveAnchor({ type: "object", label: "bottle" }, f)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("resolves an object 'top' region above center", () => {
    const f = frame({ objects: [{ label: "bottle", score: 0.9, bbox: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 } }] });
    const p = resolveAnchor({ type: "object", label: "bottle", region: "top" }, f)!;
    expect(p.y).toBeLessThan(0.5);
  });

  it("returns null when the object is absent", () => {
    expect(resolveAnchor({ type: "object", label: "bottle" }, frame({}))).toBeNull();
  });

  it("resolves a mouth landmark anchor", () => {
    const f = frame({ mouth: { x: 0.5, y: 0.3 } });
    expect(resolveAnchor({ type: "landmark", label: "mouth" }, f)).toEqual({ x: 0.5, y: 0.3 });
  });

  it("returns null for a mouth anchor with no face", () => {
    expect(resolveAnchor({ type: "landmark", label: "mouth" }, frame({}))).toBeNull();
  });

  it("matches non-bottle object labels directly", () => {
    const f = frame({ objects: [{ label: "scissors", score: 0.8, bbox: { x: 0, y: 0, w: 0.2, h: 0.2 } }] });
    expect(resolveAnchor({ type: "object", label: "scissors" }, f)).toEqual({ x: 0.1, y: 0.1 });
  });
});
