import { useEffect, useRef, useState } from "react";
import { GuidanceView } from "./overlay/GuidanceView";
import { InstructionSet, Lang } from "./types";
import { LANGS, loc, t } from "./i18n";
import {
  SAMPLES,
  SampleRef,
  loadInstructionSetUrl,
  readInstructionSetFile,
} from "./instructionSet";

export default function App() {
  const [lang, setLang] = useState<Lang>("en");
  const [set, setSet] = useState<InstructionSet | null>(null);
  const [sampleId, setSampleId] = useState<string | null>(SAMPLES[0].id);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadInstructionSetUrl(SAMPLES[0].url)
      .then(setSet)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load instruction set"));
  }, []);

  const selectSample = async (sample: SampleRef) => {
    try {
      const parsed = await loadInstructionSetUrl(sample.url);
      setSet(parsed);
      setSampleId(sample.id);
      setLoadError(null);
      setRunning(false);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load sample");
    }
  };

  const onPickFile = async (file: File) => {
    try {
      const parsed = await readInstructionSetFile(file);
      setSet(parsed);
      setSampleId(null);
      setLoadError(null);
      setRunning(false);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Invalid instruction set");
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo">◎</div>
          <div>
            <div className="brandTitle">{t(lang, "appTitle")}</div>
            <div className="brandTag">{t(lang, "tagline")}</div>
          </div>
        </div>
        <div className="topActions">
          {SAMPLES.length > 1 && (
            <div className="sampleSwitch">
              {SAMPLES.map((s) => (
                <button
                  key={s.id}
                  className={s.id === sampleId ? "active" : ""}
                  onClick={() => selectSample(s)}
                >
                  {loc(lang, s.name)}
                </button>
              ))}
            </div>
          )}
          <button
            className="ghost"
            onClick={() => fileRef.current?.click()}
          >
            {t(lang, "loadSet")}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickFile(f);
              e.target.value = "";
            }}
          />
          <div className="langToggle">
            {LANGS.map((l) => (
              <button
                key={l}
                className={l === lang ? "active" : ""}
                onClick={() => setLang(l)}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="main">
        {!set && !loadError && <div className="centerCard">…</div>}
        {loadError && <div className="centerCard error">{loadError}</div>}

        {set && !running && (
          <div className="landing">
            <div className="landingCard">
              <div className="landingKicker">{t(lang, "sample")}: {set.task_id}</div>
              <h1>{loc(lang, set.title)}</h1>
              <ol className="landingSteps">
                {set.steps.map((s) => (
                  <li key={s.id}>{loc(lang, s.title)}</li>
                ))}
              </ol>
              <p className="landingHint">{t(lang, "grantCamera")}</p>
              <button className="primary big" onClick={() => setRunning(true)}>
                {t(lang, "start")}
              </button>
            </div>
          </div>
        )}

        {set && running && (
          <GuidanceView set={set} lang={lang} onExit={() => setRunning(false)} />
        )}
      </main>
    </div>
  );
}
