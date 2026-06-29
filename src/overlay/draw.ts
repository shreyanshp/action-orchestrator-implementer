// Canvas 2D drawing helpers for the AR overlay.
//
// All coordinate inputs to the draw* functions are in canvas (pixel) space.
// Use normToCanvas() to map normalized [0,1] perception coordinates, applying
// horizontal mirroring to match the selfie-mirrored video.

import { Point, PoseLandmark } from "../types";

export interface ViewMap {
  cw: number; // canvas logical width
  ch: number; // canvas logical height
  mirror: boolean;
}

/** BlazePose 33-point skeleton connections (torso + limbs). */
const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];

const POSE_MIN_VIS = 0.5;

/** Draw the body-pose skeleton (connections + joints). */
export function drawPose(
  ctx: CanvasRenderingContext2D,
  landmarks: PoseLandmark[],
  view: ViewMap,
  color: string,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  for (const [a, b] of POSE_CONNECTIONS) {
    const pa = landmarks[a];
    const pb = landmarks[b];
    if (!pa || !pb || pa.visibility < POSE_MIN_VIS || pb.visibility < POSE_MIN_VIS) continue;
    const A = normToCanvas(pa, view);
    const B = normToCanvas(pb, view);
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
  }

  for (const p of landmarks) {
    if (p.visibility < POSE_MIN_VIS) continue;
    const P = normToCanvas(p, view);
    ctx.beginPath();
    ctx.arc(P.x, P.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function normToCanvas(p: Point, view: ViewMap): Point {
  return {
    x: (view.mirror ? 1 - p.x : p.x) * view.cw,
    y: p.y * view.ch,
  };
}

export function drawHighlight(
  ctx: CanvasRenderingContext2D,
  c: Point,
  radius: number,
  phase: number,
  color: string,
) {
  const pulse = radius * (1 + 0.15 * Math.sin(phase));
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(c.x, c.y, pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.arc(c.x, c.y, pulse * 1.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Progress ring around an anchor (clockwise from 12 o'clock). */
export function drawProgressArc(
  ctx: CanvasRenderingContext2D,
  c: Point,
  radius: number,
  progress: number,
  color: string,
) {
  if (progress <= 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius + 12, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawArrow(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  color: string,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const head = 18;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - head * Math.cos(ang - Math.PI / 6), to.y - head * Math.sin(ang - Math.PI / 6));
  ctx.lineTo(to.x - head * Math.cos(ang + Math.PI / 6), to.y - head * Math.sin(ang + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Faint bounding box with a small label, for detected objects. */
export function drawBBox(
  ctx: CanvasRenderingContext2D,
  tl: Point,
  br: Point,
  color: string,
  label: string,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  ctx.setLineDash([]);
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = color;
  ctx.fillText(label, tl.x + 4, tl.y + 14);
  ctx.restore();
}
