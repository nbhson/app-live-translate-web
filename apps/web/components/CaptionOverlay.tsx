"use client";
import { useRef } from "react";

type Props = {
  interim: string;
  finals: { text: string; language: string; ts: number }[];
  translations: Record<string, string[]>;
  detectedLang?: string;
  confidence?: number;
  fontSize?: number;
  opacity?: number;
  targetLangs?: string[];
};

export function CaptionOverlay({ interim, finals, translations, detectedLang, confidence, fontSize=18, opacity=0.95, targetLangs }: Props) {
  const lastFinal = finals[finals.length - 1];
  const dragRef = useRef<HTMLDivElement>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    const el = dragRef.current;
    if (!el) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = el.getBoundingClientRect();
    const offsetX = startX - rect.left;
    const offsetY = startY - rect.top;
    const onMove = (ev: MouseEvent) => {
      el.style.position = "fixed";
      el.style.left = ev.clientX - offsetX + "px";
      el.style.top = ev.clientY - offsetY + "px";
      el.style.zIndex = "50";
      el.style.width = rect.width + "px";
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      ref={dragRef}
      onMouseDown={onMouseDown}
      className="bg-black rounded-xl p-6 min-h-[280px] flex flex-col justify-end border border-zinc-800 cursor-move select-none"
      style={{ opacity, fontSize: fontSize + "px" }}
      title="Kéo để di chuyển overlay"
    >
      <div className="space-y-3">
        {finals.slice(-3).map((f, i) => (
          <div key={i} className="space-y-1">
            <div className="text-white leading-relaxed">{f.text}</div>
            {Object.entries(translations).map(([lang, arr]) => {
              const idx = finals.length - 3 + i;
              const t = arr[idx];
              if (!t) return null;
              const color = lang === "vi" ? "text-amber-300" : lang === "en" ? "text-sky-300" : "text-emerald-300";
              return (
                <div key={lang} className={`${color} text-[0.9em]`}>
                  [{lang}] {t}
                </div>
              );
            })}
          </div>
        ))}
        {interim && (
          <div className="text-zinc-400 opacity-70 italic"> {interim} </div>
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
