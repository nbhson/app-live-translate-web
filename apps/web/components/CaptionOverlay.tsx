"use client";
import { useEffect, useRef } from "react";

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

const LANG_COLOR: Record<string, string> = {
  vi: "text-amber-500 dark:text-amber-300",
  en: "text-sky-600 dark:text-sky-300",
};

function TranslationLines({ translations, idx }: { translations: Record<string, string[]>; idx: number }) {
  return (
    <>
      {Object.entries(translations).map(([lang, arr]) => {
        const t = arr[idx];
        if (!t) return <div key={lang} className="text-[0.85em] text-faint italic">[{lang}] … translating</div>;
        return (
          <div key={lang} className={`${LANG_COLOR[lang] ?? "text-emerald-600 dark:text-emerald-300"} text-[0.9em] leading-relaxed`}>
            {t}
          </div>
        );
      })}
    </>
  );
}

export function CaptionOverlay({ interim, finals, sentences, translations, detectedLang, confidence, fontSize=18, opacity=0.95, targetLangs }: Props) {
  const seqs = (sentences ?? []).map((s, idx) => (s ? idx : -1)).filter((i) => i >= 0);
  const hasSentences = seqs.length > 0;
  const lastFinal = hasSentences ? sentences![seqs[seqs.length - 1]] : finals[finals.length - 1]?.text;
  const scrollRef = useRef<HTMLDivElement>(null);

  // R2-9: JSON.stringify(translations) trong deps từng là O(n) mỗi render.
  // Translations được update bất biến (mỗi token tạo object mới) nên bản thân
  // reference đã đủ để autoscroll — không cần serialize.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [seqs.length, interim, translations]);

  return (
    <div
      className="bg-app rounded-xl border border-line relative shadow-lg flex flex-col h-full overflow-hidden"
      style={{ opacity, fontSize: fontSize + "px" }}
    >
      <div ref={scrollRef} className="flex-1 overflow-auto p-5 scroll-smooth" aria-live="polite" aria-label="Live captions">
        <div className="space-y-3">
          {hasSentences ? (
            seqs.map((seq) => (
              <div key={seq} className="space-y-1 border-l-2 border-lineStrong pl-3 py-1">
                <div className="text-caption leading-relaxed">{sentences![seq]}</div>
                <TranslationLines translations={translations} idx={seq} />
              </div>
            ))
          ) : (
            finals.map((f, i) => (
              <div key={i} className="space-y-1 border-l-2 border-line pl-3 py-1">
                <div className="text-caption leading-relaxed">{f.text}</div>
                <TranslationLines translations={translations} idx={i} />
              </div>
            ))
          )}
          {interim && (
            <div className="text-dim opacity-80 italic flex items-center gap-2 sticky bottom-0 bg-app/80 backdrop-blur py-2">
              <span className="inline-block w-2 h-2 bg-dim rounded-full animate-pulse" /> {interim}
            </div>
          )}
          {!lastFinal && !interim && (
            <div className="text-faint text-center py-12 text-base">Press Start to begin live caption</div>
          )}
        </div>
      </div>
      {detectedLang && (
        <div className="px-5 py-2 text-xs text-faint border-t border-line bg-app">
          Listening: {detectedLang} {confidence ? `(${Math.round(confidence*100)}%)` : ""}
          {targetLangs && targetLangs.length>1 ? ` → ${targetLangs.join(", ")}` : ""}
        </div>
      )}
    </div>
  );
}
