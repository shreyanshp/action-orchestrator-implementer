// MediaPipe Tasks Vision wrapper.
//
// Loads three models (hands, face, object detector) and exposes per-frame
// detection that produces normalized PerceptionFrame pieces.
//
// WASM + model assets load from the jsDelivr / Google CDN by default. To run
// fully offline, vendor them under public/ and change the URLs below.

import {
  FilesetResolver,
  HandLandmarker,
  FaceLandmarker,
  ObjectDetector,
} from "@mediapipe/tasks-vision";
import { DetectedObject, Hand, Point } from "../types";

const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const OBJECT_MODEL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";

// MediaPipe face-mesh mouth landmark indices (inner upper/lower lip).
const MOUTH_IDX = [13, 14];

export interface Detectors {
  hand: HandLandmarker;
  face: FaceLandmarker;
  object: ObjectDetector;
}

export async function loadDetectors(): Promise<Detectors> {
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
  const [hand, face, object] = await Promise.all([
    HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 2,
    }),
    FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 1,
    }),
    ObjectDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: OBJECT_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      scoreThreshold: 0.3,
      maxResults: 8,
    }),
  ]);
  return { hand, face, object };
}

export function detectHands(
  d: Detectors,
  video: HTMLVideoElement,
  ts: number,
): Hand[] {
  const res = d.hand.detectForVideo(video, ts);
  return (res.landmarks ?? []).map((lm, i) => ({
    handedness: res.handedness?.[i]?.[0]?.categoryName ?? "Unknown",
    landmarks: lm.map((p) => ({ x: p.x, y: p.y })),
  }));
}

export function detectMouth(
  d: Detectors,
  video: HTMLVideoElement,
  ts: number,
): Point | null {
  const res = d.face.detectForVideo(video, ts);
  const face = res.faceLandmarks?.[0];
  if (!face) return null;
  let x = 0;
  let y = 0;
  let n = 0;
  for (const idx of MOUTH_IDX) {
    const p = face[idx];
    if (p) {
      x += p.x;
      y += p.y;
      n++;
    }
  }
  return n ? { x: x / n, y: y / n } : null;
}

export function detectObjects(
  d: Detectors,
  video: HTMLVideoElement,
  ts: number,
): DetectedObject[] {
  const res = d.object.detectForVideo(video, ts);
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  return (res.detections ?? []).map((det) => {
    const c = det.categories?.[0];
    const bb = det.boundingBox!;
    return {
      label: c?.categoryName ?? "object",
      score: c?.score ?? 0,
      bbox: {
        x: bb.originX / vw,
        y: bb.originY / vh,
        w: bb.width / vw,
        h: bb.height / vh,
      },
    };
  });
}
