"use client";

type Props = {
  interim: string;
  finals: { text: string; language: string; ts: number }[];
  sentences?: string[]; // seq-aligned source sentences (seq mapping fixes slow AI mis-alignment)
  translations: Record<string, string[]>;
  detectedLang?: string;
  confidence?: number;
  fontSize?: number;
  opacity?: number;
  targetLangs?: string[];
};

export function CaptionOverlay({ interim, finals, sentences, translations, detectedLang, confidence, fontSize=18, opacity=0.95, targetLangs }: Props) {
  const seqs = (sentences ?? []).map((s, idx) => (s ? idx : -1)).filter((i) => i >= 0);
  const hasSentences = seqs.length > 0;
  const displaySeqs = hasSentences ? seqs.slice(-3) : [];
  const lastFinal = hasSentences ? (displaySeqs.length ? ({ text: sentences![displaySeqs[displaySeqs.length - 1]] } as any) : undefined) : finals[finals.length - 1];

  return (
    <div
      className="bg-zinc-950 rounded-xl p-5 min-h-[300px] flex flex-col justify-end border border-zinc-800 relative overflow-auto shadow-lg shadow-black/30"
      style={{
        opacity,
        fontSize: fontSize + "px",
      }}
    >
      <div className="space-y-3">
        {hasSentences ? (
          displaySeqs.map((seq) => {
            const s = sentences![seq];
            return (
              <div key={seq} className="space-y-1 border-l-2 border-zinc-700 pl-3 py-1">
                <div className="text-white leading-relaxed">{s}</div>
                {Object.entries(translations).map(([lang, arr]) => {
                  const t = arr[seq];
                  if (!t) return <div key={lang} className="text-[0.85em] text-zinc-500 italic">[{lang}] … đang dịch</div>;
                  const color = lang === "vi" ? "text-amber-300" : lang === "en" ? "text-sky-300" : "text-emerald-300";
                  return (
                    <div key={lang} className={`${color} text-[0.9em] leading-relaxed`}>
                      {t}
                    </div>
                  );
                })}
              </div>
            );
          })
        ) : (
          finals.slice(-3).map((f, i) => (
            <div key={i} className="space-y-1 border-l-2 border-zinc-800 pl-3 py-1">
              <div className="text-white leading-relaxed">{f.text}</div>
              {Object.entries(translations).map(([lang, arr]) => {
                const idx = finals.length - 3 + i;
                const t = arr[idx];
                if (!t) return <div key={lang} className="text-[0.85em] text-zinc-500 italic">[{lang}] …</div>;
                const color = lang === "vi" ? "text-amber-300" : lang === "en" ? "text-sky-300" : "text-emerald-300";
                return (
                  <div key={lang} className={`${color} text-[0.9em]`}>
                    {t}
                  </div>
                );
              })}
            </div>
          ))
        )}
        {interim && (
          <div className="text-zinc-400 opacity-70 italic flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-zinc-400 rounded-full animate-pulse" /> {interim}
          </div>
        )}
        {!lastFinal && !interim && (
          <div className="text-zinc-500 text-center py-8 text-base">Bấm Start để bắt đầu live caption</div>
        )}
      </div>
      {detectedLang && (
        <div className="mt-4 text-xs text-zinc-500">
          Đang nghe: {detectedLang} {confidence ? `(${Math.round(confidence*100)}%)` : ""}
          {targetLangs && targetLangs.length>1 ? ` → ${targetLangs.join(", ")}` : ""}
        </div>
      )}
    </div>
  );
}
