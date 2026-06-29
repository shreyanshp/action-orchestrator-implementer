import { describe, it, expect } from "vitest";
import { initEngine, advanceFrame, manualNext, holdProgress } from "./stepEngine";
import { InstructionSet } from "../types";

const SET: InstructionSet = {
  task_id: "test",
  title: { en: "T", ja: "T" },
  steps: [
    {
      id: "a",
      title: { en: "A", ja: "A" },
      instruction: { en: "do a", ja: "do a" },
      anchor: { type: "object", label: "bottle" },
      pointer: "arrow",
      complete_when: { signal: "sig_a", threshold: 0.6, hold_frames: 3 },
    },
    {
      id: "b",
      title: { en: "B", ja: "B" },
      instruction: { en: "do b", ja: "do b" },
      anchor: { type: "landmark", label: "mouth" },
      pointer: "highlight",
      complete_when: { signal: "sig_b", threshold: 0.7, hold_frames: 2 },
    },
  ],
};

describe("initEngine", () => {
  it("starts at step 0, not finished", () => {
    const e = initEngine(SET);
    expect(e.currentStepIndex).toBe(0);
    expect(e.finished).toBe(false);
  });
  it("finishes immediately for an empty set", () => {
    expect(initEngine({ ...SET, steps: [] }).finished).toBe(true);
  });
});

describe("advanceFrame", () => {
  it("does not advance below threshold", () => {
    let e = initEngine(SET);
    for (let i = 0; i < 10; i++) e = advanceFrame(e, { sig_a: 0.2 }, SET);
    expect(e.currentStepIndex).toBe(0);
    expect(e.holdFrames).toBe(0);
  });

  it("advances after hold_frames sustained above threshold", () => {
    let e = initEngine(SET);
    e = advanceFrame(e, { sig_a: 0.9 }, SET); // hold 1
    e = advanceFrame(e, { sig_a: 0.9 }, SET); // hold 2
    expect(e.currentStepIndex).toBe(0);
    e = advanceFrame(e, { sig_a: 0.9 }, SET); // hold 3 -> complete
    expect(e.currentStepIndex).toBe(1);
    expect(e.completedSteps).toEqual(["a"]);
  });

  it("decays hold on a miss instead of hard-resetting", () => {
    let e = initEngine(SET);
    e = advanceFrame(e, { sig_a: 0.9 }, SET); // 1
    e = advanceFrame(e, { sig_a: 0.9 }, SET); // 2
    e = advanceFrame(e, { sig_a: 0.0 }, SET); // decay -> 1
    expect(e.holdFrames).toBe(1);
  });

  it("finishes after the last step completes", () => {
    let e = initEngine(SET);
    for (let i = 0; i < 3; i++) e = advanceFrame(e, { sig_a: 1 }, SET);
    for (let i = 0; i < 2; i++) e = advanceFrame(e, { sig_b: 1 }, SET);
    expect(e.finished).toBe(true);
    expect(e.completedSteps).toEqual(["a", "b"]);
  });
});

describe("manualNext", () => {
  it("force-completes the current step", () => {
    let e = initEngine(SET);
    e = manualNext(e, SET);
    expect(e.currentStepIndex).toBe(1);
    expect(e.completedSteps).toEqual(["a"]);
  });
});

describe("holdProgress", () => {
  it("reports fractional progress and caps at 1", () => {
    let e = initEngine(SET);
    e = advanceFrame(e, { sig_a: 1 }, SET); // 1/3
    expect(holdProgress(e, SET)).toBeCloseTo(1 / 3, 5);
    expect(holdProgress({ ...e, finished: true }, SET)).toBe(1);
  });
});
