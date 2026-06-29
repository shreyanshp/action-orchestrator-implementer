// Shared types for the AR Action Guide.
//
// An "instruction set" is the inverse of the first leg's per-frame detection
// output: the first leg's *states* become our *steps*, and the first leg's
// *signals* become our step *completion criteria* (same signal names).

export type Lang = "en" | "ja";

/** A string localized for every supported language. */
export type LocalizedString = Record<Lang, string>;

/** Normalized point — x and y are in [0, 1] relative to the video frame. */
export interface Point {
  x: number;
  y: number;
}

/** Normalized bounding box — top-left origin, all values in [0, 1]. */
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------------------
// Instruction-set schema (the app's JSON input)
// ---------------------------------------------------------------------------

/** Where in the scene a step's pointer should be aimed. */
export interface Anchor {
  /**
   * "object"   — resolve to a detected object's bounding box (COCO label,
   *              e.g. "bottle", "cup"). Use `region` to aim at part of it.
   * "landmark" — resolve to a body landmark ("mouth", "wrist").
   */
  type: "object" | "landmark";
  /** Object label or landmark name to point at. */
  label: string;
  /** For object anchors: which part of the bbox to aim at. Default "center". */
  region?: "top" | "center" | "bottom";
}

/** Condition that auto-completes a step. */
export interface CompleteWhen {
  /** Signal name produced by the detection layer (see engine/signals.ts). */
  signal: string;
  /** Score in [0, 1] the signal must reach. */
  threshold: number;
  /** Number of consecutive frames the threshold must hold. */
  hold_frames: number;
}

/** One guided step. */
export interface Step {
  id: string;
  title: LocalizedString;
  instruction: LocalizedString;
  anchor: Anchor;
  /** Visual treatment of the pointer. */
  pointer: "arrow" | "highlight";
  complete_when: CompleteWhen;
}

/** A complete guidance task — the JSON the app loads. */
export interface InstructionSet {
  task_id: string;
  title: LocalizedString;
  steps: Step[];
}

// ---------------------------------------------------------------------------
// Perception / runtime types
// ---------------------------------------------------------------------------

export interface Hand {
  handedness: string; // "Left" | "Right" | "Unknown"
  /** 21 normalized hand landmarks (MediaPipe ordering). */
  landmarks: Point[];
}

export interface DetectedObject {
  label: string;
  score: number;
  bbox: BBox; // normalized
}

/** One processed camera frame, fully normalized. */
export interface PerceptionFrame {
  hands: Hand[];
  /** Mouth center landmark, or null if no face detected. */
  mouth: Point | null;
  objects: DetectedObject[];
  width: number; // source pixel width (reference only)
  height: number; // source pixel height (reference only)
}

/** Map of signal name -> score in [0, 1]. */
export type SignalScores = Record<string, number>;

/** State of the step state machine. */
export interface EngineState {
  currentStepIndex: number;
  /** Consecutive frames the current step's signal has held above threshold. */
  holdFrames: number;
  completedSteps: string[];
  finished: boolean;
}
