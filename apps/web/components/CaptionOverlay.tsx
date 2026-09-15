"use client";
import { useRef, useState, useEffect } from "react";

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
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    try {
      const raw = localStorage.getItem("lt:overlay:size");
      if (raw) setSize(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    if (size.w && size.h) {
      try { localStorage.setItem("lt:overlay:size", JSON.stringify(size)); } catch {}
    }
  }, [size]);

  const onDragStart = (e: React.MouseEvent) => {
    // chỉ drag khi click vào header drag area, không phải resize handle
    const el = dragRef.current;
    if (!el) return;
    const target = e.target as HTMLElement;
    if (target.dataset.resize) return;
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
      if (size.w) el.style.width = size.w + "px";
      if (size.h) el.style.height = size.h + "px";
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = dragRef.current;
    if (!el) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = el.offsetWidth;
    const startH = el.offsetHeight;
    const onMove = (ev: MouseEvent) => {
      const nw = Math.max(320, Math.min(window.innerWidth - 32, startW + ev.clientX - startX));
      const nh = Math.max(200, Math.min(window.innerHeight - 32, startH + ev.clientY - startY));
      el.style.width = nw + "px";
      el.style.height = nh + "px";
      setSize({ w: nw, h: nh });
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
      onMouseDown={onDragStart}
      className="bg-black rounded-xl p-6 min-h-[280px] flex flex-col justify-end border border-zinc-800 cursor-move select-none relative overflow-auto"
      style={{
        opacity,
        fontSize: fontSize + "px",
        width: size.w ? size.w + "px" : undefined,
        height: size.h ? size.h + "px" : undefined,
        resize: "both" as any,
      }}
      title="Kéo header để di chuyển, kéo góc phải-dưới để chỉnh width/height"
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
      {/* resize handle */}
      <div
        data-resize="1"
        onMouseDown={onResizeStart}
        className="absolute bottom-1 right-1 w-5 h-5 cursor-nwse-resize flex items-center justify-center opacity-60 hover:opacity-100"
        title="Kéo để chỉnh width/height"
      >
        <div className="w-3 h-3 border-r-2 border-b-2 border-zinc-500 rounded-br" />
      </div>
      <div className="absolute top-2 left-2 text-[10px] text-zinc-600 pointer-events-none">⋮⋮ drag • ↘ resize</div>
    </div>
  );
}
