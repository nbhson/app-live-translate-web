"use client";
import { SUPPORTED_SOURCE_LANGUAGES, SUPPORTED_TARGET_LANGUAGES } from "@live-translate/shared";

type Props = {
  sourceLang: string;
  targetLangs: string[];
  onSourceChange: (v: string) => void;
  onTargetsChange: (v: string[]) => void;
};

export function LanguageSelector({ sourceLang, targetLangs, onSourceChange, onTargetsChange }: Props) {
  const toggleTarget = (code: string) => {
    if (targetLangs.includes(code)) {
      if (targetLangs.length===1) return;
      onTargetsChange(targetLangs.filter(c=>c!==code));
    } else {
      if (targetLangs.length>=3) return; // max 3 per ARCHITECTURE phase 4
      onTargetsChange([...targetLangs, code]);
    }
  };
  return (
    <>
      <label className="flex flex-col gap-1.5 min-w-0">
        <span className="label">Source caption</span>
        <select
          value={sourceLang}
          onChange={(e) => onSourceChange(e.target.value)}
          className="select"
          aria-label="Source caption language"
        >
          {SUPPORTED_SOURCE_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeLabel} ({l.code})
            </option>
          ))}
        </select>
        <span className="hint">auto = Deepgram detect_language</span>
      </label>

      <div className="flex flex-col gap-1.5 min-w-0" role="group" aria-label="Target languages">
        <span className="label">Translate to (1–3)</span>
        <div className="flex flex-wrap gap-1.5 min-h-[36px] content-start">
          {SUPPORTED_TARGET_LANGUAGES.map((l) => {
            const active = targetLangs.includes(l.code);
            return (
              <button
                key={l.code}
                onClick={()=>toggleTarget(l.code)}
                aria-pressed={active}
                className={`badge badge-chip ${active ? "!bg-amber-500 !text-black !border-amber-400 shadow" : ""}`}
                title={l.label}
              >
                {l.nativeLabel} {active ? "✓" : ""}
              </button>
            );
          })}
        </div>
        <span className="hint">Selected: {targetLangs.join(", ") || "(none)"} — saved automatically</span>
      </div>
    </>
  );
}
