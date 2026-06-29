// Canvas 2D drawing helpers for the AR overlay.
//
// All coordinate inputs to the draw* functions are in canvas (pixel) space.
// Use normToCanvas() to map normalized [0,1] perception coordinates, applying
// horizontal mirroring to match the selfie-mirrored video.

import { Point } from "../types";

export interface ViewMap {
  cw: number; // canvas logical width
  ch: number; // canvas logical height
  mirror: boolean;
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
