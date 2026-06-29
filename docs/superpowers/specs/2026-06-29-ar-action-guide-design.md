# AR Action Guide — Design Spec

**Date:** 2026-06-29
**Status:** Approved (build in progress)

## Summary

The inverse of the "Factory Action Console" (first leg). Where the first leg
*detects* a worker action sequence from a camera and emits per-frame JSON, this
app *teaches* an action sequence: it loads an **instruction-set JSON**, opens the
camera, and overlays **AR pointers** (arrows + highlight rings + step cues) that
guide a user step-by-step through performing the action.

It is a **generic guidance engine** driven by JSON, shipped with **Skill share**
(`lift → cap → drink`) as the flagship sample; any conforming instruction-set JSON
can be loaded to guide a different task. Steps **auto-advance**
when in-browser detection confirms them, with a **manual Next** fallback so a
live demo never stalls.

All client-side. No backend. Deployable as static files.

## Relationship to the first leg

The first leg emits a per-frame `signals` block:
`hand_bottle_proximity`, `neck_hand_proximity`, `wrist_rotation`,
`mouth_bottle_proximity`, `bottle_tilt`, and a state machine
`idle → bottle_in_hand → cap_opening → drinking → completed`.

Our instruction-set JSON is the natural inverse:
- first-leg **states** → our **steps**
- first-leg **signals** → our step **completion criteria** (same signal names)

So a detection output and a guidance input are two views of the same action model.

## Architecture

```
Camera (getUserMedia → <video>)
   │
Detection loop (MediaPipe Tasks Vision: HandLandmarker + FaceLandmarker + ObjectDetector)
   │                                   (hands+face every frame, object detector throttled)
   ▼
PerceptionFrame { hands[], mouth, objects[] }   // normalized coords
   │
signals.ts  (pure)  →  Record<signalName, score 0..1>
   │
StepEngine (pure state machine)  →  { currentStepIndex, progress, holdProgress, complete }
   │
anchors.ts (pure)  →  resolve current step's anchor to screen coords
   │
AROverlay (Canvas 2D)  →  arrow + highlight ring + step label + 3-step progress bar
```

**Stack:** React + Vite + TypeScript, `@mediapipe/tasks-vision`, Canvas 2D overlay.

## Instruction-set JSON schema

```jsonc
{
  "task_id": "skill-share",
  "title": { "en": "Skill share", "ja": "スキルシェア" },
  "steps": [
    {
      "id": "lift",
      "title":       { "en": "...", "ja": "..." },
      "instruction": { "en": "...", "ja": "..." },
      "anchor":  { "type": "object", "label": "bottle" },   // type: object | landmark
      "pointer": "arrow",                                    // arrow | highlight
      "complete_when": { "signal": "hand_bottle_proximity", "threshold": 0.6, "hold_frames": 8 }
    }
  ]
}
```

- `anchor.type: "object"` resolves via ObjectDetector bbox (COCO label, e.g. `bottle`).
  Optional `region: "top"` points at the top-center of the bbox (used for the cap step).
- `anchor.type: "landmark"` resolves via face/hand landmarks (`mouth`, `wrist`).
- `complete_when` advances the step when `signal ≥ threshold` sustained for `hold_frames`
  consecutive frames, or when the user taps **Next**.

Default `skill-share.json` ships in `public/instruction-sets/`. A **Load instruction set**
file picker loads any conforming JSON to prove the engine is generic.

## Components / modules

| Module | Purpose | Pure? |
|---|---|---|
| `useCamera` | getUserMedia, video element, permission/error states | no (hook) |
| `detection/mediapipe.ts` | load models, run `detectForVideo`, build PerceptionFrame | no |
| `useDetection` | render loop, throttling, exposes latest PerceptionFrame + FPS | no (hook) |
| `engine/signals.ts` | PerceptionFrame → signal scores | **yes** |
| `engine/stepEngine.ts` | state machine over the instruction set | **yes** |
| `engine/anchors.ts` | step anchor → screen coords | **yes** |
| `overlay/AROverlay.tsx` + `draw.ts` | canvas rendering of pointers/labels | draw helpers pure-ish |
| `components/*` | control bar, step panel, progress bar, loader, lang toggle | no |
| `i18n/*` | EN/JA strings, default EN | — |

## Signals (Skill share)

- `hand_bottle_proximity` — nearest hand landmark to bottle bbox; 1.0 inside, falloff outside.
- `neck_hand_proximity` — hand near the **top region** of the bottle bbox (cap area).
- `mouth_bottle_proximity` — bottle (top/center) near the mouth landmark.
- `wrist_rotation`, `bottle_tilt` — interface present, optional/best-effort for v1.

## Error handling

- Camera permission denied → clear message + retry.
- Model load failure → status banner; app still loads UI.
- Anchor not currently visible → arrow parks at last-known position + "point camera at {target}" hint; **Next** always available.

## Testing

- `signals.ts`, `stepEngine.ts`, `anchors.ts` are pure → unit tests (Vitest) with
  synthetic PerceptionFrames / signal streams.
- MediaPipe integration + overlay → manual smoke test against the Skill share flow.

## Performance

- Hands + Face every frame; ObjectDetector throttled (every ~3rd frame, cached),
  mirroring the first leg's "run discovery at lower fps".
- Frames downscaled to detector input; FPS shown in UI.

## Deliverables

- Running static frontend (`npm install && npm run dev`).
- `skill-share.json` sample instruction set + schema doc in README.
- README: setup, how to author a new instruction set, how anchors/signals map to the first leg.
- Unit tests for pure logic.

## Out of scope (v1)

- Backend / WebSocket integration with the live first leg (signal names are kept
  compatible so it can be added later).
- 3D / WebXR depth anchoring.
- Multi-person guidance.
