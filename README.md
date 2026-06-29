# AR Action Guide

The **second leg** of the Factory Action Console. Where the first leg *detects* a
worker action sequence from a camera feed and emits per-frame JSON, this app does
the inverse: it **ingests an instruction-set JSON** and overlays **in-browser AR
pointers** that guide a person through performing the action, step by step.

- Opens the camera (`getUserMedia`).
- Runs MediaPipe **Hands + Face + Object Detector** entirely in the browser.
- Drives a generic **step state machine** from an instruction-set JSON.
- Draws **AR pointers** (arrow + pulsing highlight + progress ring) onto the live
  feed, anchored to the real bottle / hand / mouth.
- **Auto-advances** when detection confirms a step, with a **manual Next** fallback.
- English / Japanese toggle, dark industrial theme. No backend — pure static frontend.

The flagship sample is **Skill share** (`lift → cap → drink`), the exact sequence
the first leg detects. The engine is generic — load any conforming instruction-set
JSON from the header to guide a different task/object.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Open in **Chrome** (desktop or tablet), click **Start guidance**, allow camera
access, and hold a water bottle in view.

Other commands:

```bash
npm test             # unit tests for the pure engine (signals, step machine, anchors)
npm run typecheck    # tsc type check
npm run build        # production build to dist/
```

> The MediaPipe WASM runtime and model files load from a CDN on first run, so the
> initial load needs internet access. To run fully offline, vendor the assets under
> `public/` and update the URLs in `src/detection/mediapipe.ts`.

## How it connects to the first leg

The first leg's per-frame WebSocket message contains a state machine
(`idle → bottle_in_hand → cap_opening → drinking → completed`) and a `signals`
block. This app is the inverse view of the same action model:

| First leg (detection)        | This app (guidance)                    |
| ---------------------------- | -------------------------------------- |
| state (`bottle_in_hand`, …)  | **step** in the instruction set        |
| `signals.hand_bottle_proximity`, etc. | step **`complete_when.signal`** (same names) |
| detected object bbox         | step **`anchor`** target               |

So a detection output and a guidance input describe the same thing from opposite
directions — and the signal names are deliberately identical.

## Instruction-set JSON

The app's input. `public/instruction-sets/skill-share.json` ships built in; use
**Load instruction set** in the header to drop in any conforming file.

```jsonc
{
  "task_id": "skill-share",
  "title": { "en": "Skill share", "ja": "スキルシェア" },
  "steps": [
    {
      "id": "lift",
      "title":       { "en": "Lift the water bottle", "ja": "水のボトルを持ち上げる" },
      "instruction": { "en": "Pick up the bottle with your hand.", "ja": "手でボトルを持ち上げてください。" },
      "anchor":  { "type": "object", "label": "bottle" },   // what the pointer aims at
      "pointer": "arrow",                                    // "arrow" | "highlight"
      "complete_when": { "signal": "hand_bottle_proximity", "threshold": 0.6, "hold_frames": 8 }
    }
  ]
}
```

### Field reference

| Field | Meaning |
| --- | --- |
| `task_id` | Identifier for the task. |
| `title` | Localized task title (`en`, `ja`). |
| `steps[]` | Ordered guided steps. |
| `step.id` | Stable step id (also used in completion tracking). |
| `step.title` / `step.instruction` | Localized text shown in the step card. |
| `step.anchor.type` | `object` (detected object bbox) or `landmark` (body point). |
| `step.anchor.label` | Object label (`bottle`, `cup`, any COCO class) or landmark (`mouth`, `wrist`). |
| `step.anchor.region` | For objects: `top` \| `center` \| `bottom` (which part of the bbox to aim at). |
| `step.pointer` | `arrow` or `highlight` visual treatment. |
| `step.complete_when.signal` | Signal name that auto-completes the step. |
| `step.complete_when.threshold` | Score in `[0,1]` the signal must reach. |
| `step.complete_when.hold_frames` | Consecutive frames it must hold before completing. |

### Available signals (v1)

Computed in `src/engine/signals.ts` from the in-browser perception:

| Signal | Meaning |
| --- | --- |
| `hand_bottle_proximity` | A hand is on/near a bottle/cup. |
| `neck_hand_proximity` | A hand is at the bottle's top/cap region. |
| `mouth_bottle_proximity` | The mouth is at the nearest edge of the bottle bbox (orientation-independent). |
| `bottle_tilt` | How horizontal the bottle is (tilted toward drinking). |
| `drinking` | Composite: bottle at the mouth and tilting horizontal. |
| `hand_object_proximity` | A hand is on/near the primary detected object (any class). |
| `object_top_hand_proximity` | A hand is at the top region of the primary object. |
| `mouth_object_proximity` | The primary object is at the nearest edge of the mouth. |
| `wrist_rotation` | Reserved (returns `0` in v1; interface kept for parity with the first leg). |

The `*_object_*` signals are object-agnostic (they target the most confident
non-person detection), so a custom instruction set can guide any object with the
same engine. The named `*_bottle_*` signals mirror the first leg's exact signal
names. `drinking` is a composite of `mouth_bottle_proximity` and `bottle_tilt`.

### Authoring a new instruction set

1. List the steps in order.
2. For each step pick an **anchor** — what the user should look at / act on.
3. Pick a **`complete_when.signal`** + `threshold` + `hold_frames` that confirms the
   step is done (or rely on the manual **Next** button).
4. Save as JSON and load it via **Load instruction set**.

New target objects work automatically if they're a class the bundled
EfficientDet-Lite object detector knows (the COCO set). New signals require a small
addition to `src/engine/signals.ts`.

## Architecture

```
Camera (getUserMedia → <video>)
   │
useDetection  →  MediaPipe Hands + Face + ObjectDetector  →  PerceptionFrame
   │                       (hands+face every frame, object detector every 3rd)
computeSignals (pure)      →  signal scores
   │
StepEngine (pure)          →  current step, hold progress, finished
   │
resolveAnchor (pure)       →  screen point for the current step
   │
AROverlay (Canvas 2D)      →  arrow + highlight + progress ring + step card
```

| Path | Responsibility |
| --- | --- |
| `src/detection/useCamera.ts` | Camera stream + permission/error states. |
| `src/detection/mediapipe.ts` | Load models, run per-frame detection → normalized data. |
| `src/detection/useDetection.ts` | RAF loop, throttling, FPS. |
| `src/engine/signals.ts` | PerceptionFrame → signal scores (**pure**). |
| `src/engine/stepEngine.ts` | Step state machine (**pure**). |
| `src/engine/anchors.ts` | Anchor → normalized point (**pure**). |
| `src/overlay/draw.ts` | Canvas drawing helpers. |
| `src/overlay/GuidanceView.tsx` | Wires perception → engine → overlay + HUD. |
| `src/App.tsx` | Shell, instruction-set loader, language toggle. |
| `src/instructionSet.ts` | Load + validate instruction-set JSON. |
| `src/i18n/*` | EN / JA strings. |

## Test plan

### Per-step (manual smoke test, Skill share sample)

| Step | How to pass | Expected |
| --- | --- | --- |
| `lift` | Bring your hand onto a visible bottle | Arrow points at the bottle; ring fills; advances to `cap`. |
| `cap` | Move your hand to the top of the bottle | Highlight sits on the cap region; advances to `drink`. |
| `drink` | Tilt the bottle horizontal (as if drinking) | `bottle_tilt` clears the bar; advances to **complete**. |
| fallback | At any step, tap **Next** | Step force-completes (demo never stalls). |
| no target | Hide the bottle | "Point the camera at the bottle" hint; arrow parks at last position. |

### Pure-logic (automated)

`npm test` covers signal scoring, state-machine advancement / decay / manual-next,
and anchor resolution.

## Three-minute demo

1. **Happy path (English).** Start → guide through lift → cap → drink → completion
   screen. Highlight the auto-advancing rings.
2. **Manual fallback + language.** Restart, switch to **JA**, and use **Next** to
   walk the steps when detection is shy — shows robustness for a live stage.
3. **Generic engine.** Load a custom instruction-set JSON (any object the detector
   knows, via the `*_object_*` signals) to prove the same engine guides any task.

## Phase 2

- Two-hand cap-opening detection (`wrist_rotation`, cap-as-separate-object).
- More signals (`bottle_tilt`, head tilt) for higher-confidence drinking.
- Connect to the live first-leg backend over WebSocket (signal names already match).
- Multi-person guidance.
- Visual-prompt object targets (guide toward a factory-specific part).
- Offline/vendored MediaPipe assets + PWA install.
- Author/edit instruction sets in-app.
```
# action-orchestrator-implementer
