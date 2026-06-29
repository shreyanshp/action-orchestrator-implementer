import { useCallback, useEffect, useRef, useState } from "react";
import { useCamera } from "../detection/useCamera";
import { useDetection } from "../detection/useDetection";
import { computeSignals, findBottle } from "../engine/signals";
import { advanceFrame, holdProgress, initEngine, manualNext } from "../engine/stepEngine";
import { resolveAnchor } from "../engine/anchors";
import { EngineState, InstructionSet, Lang, PerceptionFrame, Point, SignalScores } from "../types";
import { loc, t } from "../i18n";
import {
  ViewMap,
  drawArrow,
  drawBBox,
  drawHands,
  drawHighlight,
  drawPose,
  drawProgressArc,
  normToCanvas,
} from "./draw";

const MIRROR = true;
const ACCENT = "#38e8ff";
const DONE = "#37f5a0";
const POSE_COLOR = "rgba(155,140,255,0.9)";
const HAND_COLOR = "rgba(255,179,71,0.95)";

interface Props {
  set: InstructionSet;
  lang: Lang;
  onExit: () => void;
}

/** Per-step tuning overrides, keyed by step id. */
type Overrides = Record<string, { threshold: number; hold_frames: number }>;

function initOverrides(set: InstructionSet): Overrides {
  const o: Overrides = {};
  for (const s of set.steps) {
    o[s.id] = { threshold: s.complete_when.threshold, hold_frames: s.complete_when.hold_frames };
  }
  return o;
}

/** Build an instruction set with the live tuning overrides applied. */
function applyOverrides(set: InstructionSet, ov: Overrides): InstructionSet {
  return {
    ...set,
    steps: set.steps.map((s) => ({
      ...s,
      complete_when: {
        ...s.complete_when,
        threshold: ov[s.id]?.threshold ?? s.complete_when.threshold,
        hold_frames: ov[s.id]?.hold_frames ?? s.complete_when.hold_frames,
      },
    })),
  };
}

interface Hud {
  stepIndex: number;
  hold: number;
  finished: boolean;
  fps: number;
  anchorVisible: boolean;
  signals: SignalScores;
  bottleSeen: boolean;
  mouthSeen: boolean;
  handsSeen: number;
  poseSeen: boolean;
}

const EMPTY_HUD: Hud = {
  stepIndex: 0,
  hold: 0,
  finished: false,
  fps: 0,
  anchorVisible: true,
  signals: {},
  bottleSeen: false,
  mouthSeen: false,
  handsSeen: 0,
  poseSeen: false,
};

export function GuidanceView({ set, lang, onExit }: Props) {
  const { videoRef, status, error: camError, start, stop } = useCamera();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const engineRef = useRef<EngineState>(initEngine(set));
  const lastAnchorRef = useRef<Point | null>(null);
  const phaseRef = useRef(0);
  const setRef = useRef(set);
  setRef.current = set;

  // Live tuning overrides — kept in a ref for the detection loop and in state for UI.
  const [overrides, setOverridesState] = useState<Overrides>(() => initOverrides(set));
  const overridesRef = useRef(overrides);
  const setOverrides = (updater: (prev: Overrides) => Overrides) => {
    setOverridesState((prev) => {
      const next = updater(prev);
      overridesRef.current = next;
      return next;
    });
  };

  const [showSettings, setShowSettings] = useState(false);
  const [showPose, setShowPose] = useState(false);
  const showPoseRef = useRef(showPose);
  showPoseRef.current = showPose;
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);

  useEffect(() => {
    start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset engine + overrides when the instruction set changes.
  useEffect(() => {
    engineRef.current = initEngine(set);
    lastAnchorRef.current = null;
    const init = initOverrides(set);
    overridesRef.current = init;
    setOverridesState(init);
    setHud({ ...EMPTY_HUD });
  }, [set]);

  const onFrame = useCallback((frame: PerceptionFrame, fps: number) => {
    const effective = applyOverrides(setRef.current, overridesRef.current);
    const signals = computeSignals(frame);
    engineRef.current = advanceFrame(engineRef.current, signals, effective);
    const eng = engineRef.current;
    phaseRef.current += 0.15;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const cw = video.clientWidth;
    const ch = video.clientHeight;
    if (cw === 0 || ch === 0) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const view: ViewMap = { cw, ch, mirror: MIRROR };

    if (showPoseRef.current) {
      if (frame.pose) drawPose(ctx, frame.pose, view, POSE_COLOR);
      if (frame.hands.length > 0) drawHands(ctx, frame.hands, view, HAND_COLOR);
    }

    const bottle = findBottle(frame);
    if (bottle) {
      const tl = normToCanvas({ x: bottle.bbox.x, y: bottle.bbox.y }, view);
      const br = normToCanvas({ x: bottle.bbox.x + bottle.bbox.w, y: bottle.bbox.y + bottle.bbox.h }, view);
      drawBBox(ctx, { x: Math.min(tl.x, br.x), y: tl.y }, { x: Math.max(tl.x, br.x), y: br.y }, "rgba(56,232,255,0.45)", bottle.label);
    }

    let anchorVisible = true;
    if (!eng.finished) {
      const step = effective.steps[eng.currentStepIndex];
      const aNorm = step ? resolveAnchor(step.anchor, frame) : null;
      if (aNorm) lastAnchorRef.current = normToCanvas(aNorm, view);
      anchorVisible = !!aNorm;
      const target = aNorm ? normToCanvas(aNorm, view) : lastAnchorRef.current;
      if (target) {
        const origin = { x: cw / 2, y: ch - 36 };
        drawArrow(ctx, origin, target, ACCENT);
        drawHighlight(ctx, target, 34, phaseRef.current, ACCENT);
        drawProgressArc(ctx, target, 34, holdProgress(eng, effective), DONE);
      }
    }

    setHud({
      stepIndex: eng.currentStepIndex,
      hold: holdProgress(eng, effective),
      finished: eng.finished,
      fps,
      anchorVisible,
      signals,
      bottleSeen: !!bottle,
      mouthSeen: !!frame.mouth,
      handsSeen: frame.hands.length,
      poseSeen: !!frame.pose,
    });
  }, [videoRef]);

  const { ready, error: detError } = useDetection(videoRef, {
    enabled: status === "live",
    onFrame,
  });

  const handleNext = () => {
    engineRef.current = manualNext(engineRef.current, applyOverrides(setRef.current, overridesRef.current));
  };
  const handleRestart = () => {
    engineRef.current = initEngine(setRef.current);
    lastAnchorRef.current = null;
    setHud((h) => ({ ...h, stepIndex: 0, hold: 0, finished: false }));
  };
  const resetOverrides = () => setOverrides(() => initOverrides(setRef.current));

  const step = set.steps[hud.stepIndex];
  const loading = status === "starting" || (status === "live" && !ready && !detError);

  return (
    <div className="stage">
      <div className="videoWrap">
        <video ref={videoRef} className="video" playsInline muted />
        <canvas ref={canvasRef} className="overlay" />

        <div className="stageTop">
          <span className={`statusDot ${status === "live" ? "ok" : "warn"}`} />
          <span>{status === "live" ? t(lang, "statusLive") : t(lang, "statusIdle")}</span>
          <span className="sep">·</span>
          <span>{t(lang, "fps")} {hud.fps}</span>
          <div className="topRight">
            <button
              className={`ghost small ${showPose ? "on" : ""}`}
              onClick={() => setShowPose((v) => !v)}
              title={t(lang, "pose")}
            >
              {showPose ? "👁" : "🚫"} {t(lang, "pose")}
            </button>
            <button className={`ghost small ${showSettings ? "on" : ""}`} onClick={() => setShowSettings((v) => !v)}>
              ⚙ {t(lang, "settings")}
            </button>
            <button className="ghost small" onClick={onExit}>{t(lang, "exit")}</button>
          </div>
        </div>

        {loading && <div className="centerCard">{t(lang, "loadingModels")}</div>}
        {camError && <div className="centerCard error">{t(lang, "cameraError")}: {camError}</div>}
        {detError && <div className="centerCard error">{t(lang, "modelError")}: {detError}</div>}

        {!hud.finished && (
          <div className="stepChips">
            {set.steps.map((st, i) => (
              <div
                key={st.id}
                className={`chip ${i < hud.stepIndex ? "done" : i === hud.stepIndex ? "active" : ""}`}
              >
                {loc(lang, st.title)}
              </div>
            ))}
          </div>
        )}

        {step && !hud.finished && (
          <div className="stepCard">
            <div className="stepCardHead">
              {t(lang, "step")} {hud.stepIndex + 1} {t(lang, "of")} {set.steps.length}
            </div>
            <div className="stepTitle">{loc(lang, step.title)}</div>
            <div className="stepInstruction">{loc(lang, step.instruction)}</div>
            <div className="holdBar">
              <div className="holdFill" style={{ width: `${Math.round(hud.hold * 100)}%` }} />
            </div>
            <div className="stepHint">
              {hud.anchorVisible ? t(lang, "auto") : t(lang, "pointHint", { target: step.anchor.label })}
            </div>
            <button className="primary" onClick={handleNext}>{t(lang, "next")}</button>
          </div>
        )}

        {hud.finished && (
          <div className="centerCard finished">
            <div className="finishedCheck">✓</div>
            <div className="finishedTitle">{t(lang, "finishedTitle")}</div>
            <div className="finishedBody">{t(lang, "finishedBody")}</div>
            <div className="finishedActions">
              <button className="primary" onClick={handleRestart}>{t(lang, "restart")}</button>
              <button className="ghost" onClick={onExit}>{t(lang, "exit")}</button>
            </div>
          </div>
        )}

        {showSettings && (
          <div className="settingsPanel">
            <div className="settingsHead">
              <span>{t(lang, "settingsTitle")}</span>
              <button className="ghost small" onClick={() => setShowSettings(false)}>{t(lang, "close")}</button>
            </div>
            <div className="settingsDetect">
              {t(lang, "detection")}:
              <span className={hud.bottleSeen ? "ok" : "off"}>● {t(lang, "bottle")}</span>
              <span className={hud.mouthSeen ? "ok" : "off"}>● {t(lang, "mouth")}</span>
              <span className={hud.handsSeen > 0 ? "ok" : "off"}>● {t(lang, "hands")} {hud.handsSeen}</span>
              <span className={hud.poseSeen ? "ok" : "off"}>● {t(lang, "pose")}</span>
            </div>
            <p className="settingsHint">{t(lang, "settingsHint")}</p>

            {set.steps.map((st, i) => {
              const ov = overrides[st.id] ?? { threshold: st.complete_when.threshold, hold_frames: st.complete_when.hold_frames };
              const live = hud.signals[st.complete_when.signal] ?? 0;
              const met = live >= ov.threshold;
              return (
                <div key={st.id} className={`tuneRow ${i === hud.stepIndex ? "current" : ""}`}>
                  <div className="tuneTop">
                    <span className="tuneName">{i + 1}. {loc(lang, st.title)}</span>
                    <code>{st.complete_when.signal}</code>
                  </div>
                  <div className="tuneMeter">
                    <div className="meterFill" style={{ width: `${Math.round(live * 100)}%`, background: met ? DONE : ACCENT }} />
                    <div className="meterThr" style={{ left: `${Math.round(ov.threshold * 100)}%` }} />
                  </div>
                  <div className="tuneLabels">
                    <span>{t(lang, "liveValue")} {live.toFixed(2)}</span>
                  </div>
                  <label className="tuneSlider">
                    <span>{t(lang, "threshold")} {ov.threshold.toFixed(2)}</span>
                    <input
                      type="range" min={0} max={1} step={0.01} value={ov.threshold}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setOverrides((prev) => ({ ...prev, [st.id]: { ...prev[st.id], threshold: v } }));
                      }}
                    />
                  </label>
                  <label className="tuneSlider">
                    <span>{t(lang, "hold")} {ov.hold_frames}</span>
                    <input
                      type="range" min={1} max={30} step={1} value={ov.hold_frames}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setOverrides((prev) => ({ ...prev, [st.id]: { ...prev[st.id], hold_frames: v } }));
                      }}
                    />
                  </label>
                </div>
              );
            })}

            <button className="ghost" onClick={resetOverrides}>{t(lang, "reset")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
