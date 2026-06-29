// Pure step state machine.
//
// Walks through an instruction set's steps. A step auto-completes when its
// `complete_when` signal holds above threshold for `hold_frames` consecutive
// frames, or when the caller forces it via manualNext().

import { EngineState, InstructionSet, SignalScores } from "../types";

export function initEngine(set: InstructionSet): EngineState {
  return {
    currentStepIndex: 0,
    holdFrames: 0,
    completedSteps: [],
    finished: set.steps.length === 0,
  };
}

/** Progress toward completing the current step, in [0, 1]. */
export function holdProgress(state: EngineState, set: InstructionSet): number {
  if (state.finished) return 1;
  const step = set.steps[state.currentStepIndex];
  if (!step) return 0;
  const need = Math.max(1, step.complete_when.hold_frames);
  return Math.min(1, state.holdFrames / need);
}

function completeCurrent(state: EngineState, set: InstructionSet): EngineState {
  const step = set.steps[state.currentStepIndex];
  const completedSteps = step ? [...state.completedSteps, step.id] : state.completedSteps;
  const nextIndex = state.currentStepIndex + 1;
  const finished = nextIndex >= set.steps.length;
  return {
    currentStepIndex: finished ? state.currentStepIndex : nextIndex,
    holdFrames: 0,
    completedSteps,
    finished,
  };
}

/**
 * Advance the engine by one frame using the latest signal scores.
 * holdFrames increments while the signal is above threshold and decays (rather
 * than hard-resetting) on a miss, to ride out brief detection dropouts.
 */
export function advanceFrame(
  state: EngineState,
  signals: SignalScores,
  set: InstructionSet,
): EngineState {
  if (state.finished) return state;
  const step = set.steps[state.currentStepIndex];
  if (!step) return { ...state, finished: true };

  const value = signals[step.complete_when.signal] ?? 0;
  const hit = value >= step.complete_when.threshold;
  const holdFrames = hit ? state.holdFrames + 1 : Math.max(0, state.holdFrames - 1);
  const next: EngineState = { ...state, holdFrames };

  if (holdFrames >= Math.max(1, step.complete_when.hold_frames)) {
    return completeCurrent(next, set);
  }
  return next;
}

/** Force-complete the current step (manual "Next" fallback). */
export function manualNext(state: EngineState, set: InstructionSet): EngineState {
  if (state.finished) return state;
  return completeCurrent(state, set);
}
