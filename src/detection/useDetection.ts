import { RefObject, useEffect, useRef, useState } from "react";
import { PerceptionFrame } from "../types";
import {
  Detectors,
  detectHands,
  detectMouth,
  detectObjects,
  loadDetectors,
} from "./mediapipe";

interface Options {
  enabled: boolean;
  /** Called once per processed frame with the latest perception + FPS. */
  onFrame: (frame: PerceptionFrame, fps: number) => void;
}

/** Run hands + face every frame; throttle the heavier object detector. */
const OBJECT_EVERY = 3;
/**
 * Keep the last seen objects alive for up to this many frames when a detection
 * pass returns nothing — so a brief dropout (e.g. the bottle occluded by the
 * face while drinking) doesn't make object-based signals flicker to zero.
 */
const OBJECT_STICKY_FRAMES = 30;

/**
 * Loads the MediaPipe models once, then runs a requestAnimationFrame loop while
 * `enabled`, invoking `onFrame` with each PerceptionFrame.
 */
export function useDetection(
  videoRef: RefObject<HTMLVideoElement>,
  { enabled, onFrame }: Options,
) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detectorsRef = useRef<Detectors | null>(null);
  const rafRef = useRef(0);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  // Load models once.
  useEffect(() => {
    let cancelled = false;
    loadDetectors()
      .then((d) => {
        if (!cancelled) {
          detectorsRef.current = d;
          setReady(true);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load models");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Detection loop.
  useEffect(() => {
    if (!enabled || !ready) return;

    let frameCount = 0;
    let lastObjects: PerceptionFrame["objects"] = [];
    let staleObjectFrames = 0;
    let lastTs = -1;
    let fpsWindowStart = performance.now();
    let fpsFrames = 0;
    let fps = 0;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const v = videoRef.current;
      const d = detectorsRef.current;
      if (!v || !d || v.readyState < 2) return;

      // Timestamps must strictly increase for detectForVideo.
      let ts = performance.now();
      if (ts <= lastTs) ts = lastTs + 1;
      lastTs = ts;

      const hands = detectHands(d, v, ts);
      const mouth = detectMouth(d, v, ts);
      if (frameCount % OBJECT_EVERY === 0) {
        const objs = detectObjects(d, v, ts);
        if (objs.length > 0) {
          lastObjects = objs;
          staleObjectFrames = 0;
        } else {
          staleObjectFrames += OBJECT_EVERY;
          if (staleObjectFrames > OBJECT_STICKY_FRAMES) lastObjects = [];
        }
      }
      frameCount++;

      fpsFrames++;
      const now = performance.now();
      if (now - fpsWindowStart >= 500) {
        fps = Math.round((fpsFrames * 1000) / (now - fpsWindowStart));
        fpsFrames = 0;
        fpsWindowStart = now;
      }

      onFrameRef.current(
        {
          hands,
          mouth,
          objects: lastObjects,
          width: v.videoWidth,
          height: v.videoHeight,
        },
        fps,
      );
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled, ready, videoRef]);

  return { ready, error };
}
