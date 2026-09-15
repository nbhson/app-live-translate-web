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
    <div className="flex gap-4 items-start">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-400">Caption (nguồn)</span>
        <select
          value={sourceLang}
          onChange={(e) => onSourceChange(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
        >
          {SUPPORTED_SOURCE_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeLabel} ({l.code})
            </option>
          ))}
        </select>
        <span className="text-[11px] text-zinc-500">auto = Deepgram detect_language</span>
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-zinc-400">Dịch sang (chọn 1-3, click để toggle)</span>
        <div className="flex flex-wrap gap-1 max-w-[360px]">
          {SUPPORTED_TARGET_LANGUAGES.map((l) => {
            const active = targetLangs.includes(l.code);
            return (
              <button
                key={l.code}
                onClick={()=>toggleTarget(l.code)}
                className={`px-2 py-1 rounded text-xs border ${active ? "bg-amber-500 text-black border-amber-400" : "bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}
                title={l.label}
              >
                {l.nativeLabel} {active ? "✓" : ""}
              </button>
            );
          })}
        </div>
        <span className="text-[11px] text-zinc-500">Đang chọn: {targetLangs.join(", ") || "(chưa chọn)"} — lưu vào localStorage</span>
      </div>
    </div>
  );
}
