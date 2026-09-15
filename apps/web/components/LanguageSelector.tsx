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
        <span className="text-[11px] font-medium tracking-wider uppercase text-zinc-400">Caption (nguồn)</span>
        <select
          value={sourceLang}
          onChange={(e) => onSourceChange(e.target.value)}
          className="h-9 bg-zinc-900 border border-zinc-700 rounded-lg px-3 text-sm w-full focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
        >
          {SUPPORTED_SOURCE_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeLabel} ({l.code})
            </option>
          ))}
        </select>
        <span className="text-[11px] leading-tight text-zinc-500 min-h-[28px]">auto = Deepgram detect_language</span>
      </label>

      <div className="flex flex-col gap-1.5 min-w-0">
        <span className="text-[11px] font-medium tracking-wider uppercase text-zinc-400">Dịch sang (1–3)</span>
        <div className="flex flex-wrap gap-1.5 min-h-[36px] content-start">
          {SUPPORTED_TARGET_LANGUAGES.map((l) => {
            const active = targetLangs.includes(l.code);
            return (
              <button
                key={l.code}
                onClick={()=>toggleTarget(l.code)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${active ? "bg-amber-500 text-black border-amber-400 shadow" : "bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600"}`}
                title={l.label}
              >
                {l.nativeLabel} {active ? "✓" : ""}
              </button>
            );
          })}
        </div>
        <span className="text-[11px] leading-tight text-zinc-500 min-h-[28px]">Đang chọn: {targetLangs.join(", ") || "(chưa chọn)"} — lưu localStorage</span>
      </div>
    </>
  );
}
