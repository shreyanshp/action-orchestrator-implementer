import { useCallback, useRef, useState } from "react";

export type CameraStatus = "idle" | "starting" | "live" | "error";

/**
 * Manages a getUserMedia stream attached to a <video> element.
 *
 * A generation counter guards against overlapping start/stop cycles — notably
 * React StrictMode's mount → cleanup → mount in dev, which would otherwise abort
 * the first play() promise and surface a spurious "play() interrupted" error.
 * Only a genuine getUserMedia failure is treated as fatal; an interrupted play()
 * (the camera is actually up) is ignored.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const genRef = useRef(0);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    const gen = ++genRef.current;
    setStatus("starting");
    setError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (e) {
      if (gen !== genRef.current) return; // superseded by a newer start/stop
      setError(e instanceof Error ? e.message : "Camera access failed");
      setStatus("error");
      return;
    }

    // A newer start() or a stop() happened while awaiting — discard this stream.
    if (gen !== genRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    streamRef.current = stream;
    const v = videoRef.current;
    if (v) {
      v.srcObject = stream;
      try {
        await v.play();
      } catch {
        // play() can reject when interrupted by a new load (StrictMode remount)
        // or autoplay policy. The stream is attached and muted autoplay will
        // recover — never fatal.
      }
    }
    if (gen !== genRef.current) return;
    setStatus("live");
  }, []);

  const stop = useCallback(() => {
    genRef.current++; // invalidate any in-flight start()
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) v.srcObject = null;
    setStatus("idle");
  }, []);

  return { videoRef, status, error, start, stop };
}
