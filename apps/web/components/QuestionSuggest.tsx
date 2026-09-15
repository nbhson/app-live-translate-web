"use client";
import { useState, useEffect } from "react";

export type SuggestItem = {
  seq: number;
  question: string;
  structures: string[];
  fullAnswers: string[];
  sourceLang?: string;
};

export function QuestionSuggest({ items, onClear }: { items: SuggestItem[]; onClear?: () => void }) {
  const [mode, setMode] = useState<"both" | "structures" | "full">("both");
  const [selected, setSelected] = useState(items.length - 1);
  // auto active latest when new question arrives
  useEffect(() => {
    setSelected(items.length - 1);
  }, [items.length]);
  if (items.length === 0) return null;
  const cur = items[Math.min(Math.max(0, selected), items.length - 1)];
  const latest = items[items.length - 1];

  return (
    <div className="bg-gradient-to-br from-amber-950/40 via-zinc-900 to-zinc-900 border border-amber-800/30 rounded-xl overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-amber-500 text-black flex items-center justify-center text-xs font-bold">?</span>
          <h3 className="text-sm font-medium">Suggested Answers</h3>
          <span className="text-[11px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">{items.length} questions</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex bg-zinc-800 rounded-lg p-0.5">
            <button onClick={() => setMode("both")} className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${mode === "both" ? "bg-white text-black" : "text-zinc-400"}`}>Both</button>
            <button onClick={() => setMode("structures")} className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${mode === "structures" ? "bg-white text-black" : "text-zinc-400"}`}>Structures</button>
            <button onClick={() => setMode("full")} className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${mode === "full" ? "bg-white text-black" : "text-zinc-400"}`}>Full Answers</button>
          </div>
          {onClear && <button onClick={onClear} className="ml-2 text-[11px] text-zinc-500 hover:text-zinc-300">Clear</button>}
        </div>
      </div>

      {/* question selector if multiple */}
      {items.length > 1 && (
        <div className="flex gap-1.5 px-4 py-2 overflow-x-auto border-b border-zinc-800/50 shrink-0">
          {items.slice(-6).map((it, idx) => {
            const realIdx = items.length - Math.min(6, items.length) + idx;
            return (
              <button
                key={it.seq}
                onClick={() => setSelected(realIdx)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs border truncate max-w-[180px] ${realIdx === selected ? "bg-amber-500 text-black border-amber-400" : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"}`}
                title={it.question}
              >
                #{it.seq + 1} {it.question.slice(0, 28)}
              </button>
            );
          })}
        </div>
      )}

      <div className="p-4 space-y-3 overflow-auto flex-1 min-h-0">
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
          <div className="text-[11px] text-zinc-500 mb-1">Question #{cur.seq + 1}</div>
          <div className="text-sm text-white font-medium leading-relaxed">“{cur.question}”</div>
        </div>

        {(mode === "both" || mode === "structures") && (
          <div>
            <div className="text-xs font-medium text-zinc-300 mb-2 flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-zinc-800 flex items-center justify-center text-[10px]">≡</span> 2–3 suggested structures
            </div>
            <div className="space-y-2">
              {cur.structures.map((s, i) => (
                <div key={i} className="flex gap-2 bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-2">
                  <span className="text-amber-400 text-xs font-mono mt-0.5">{i + 1}.</span>
                  <span className="text-sm text-zinc-200 flex-1">{s}</span>
                  <button onClick={() => navigator.clipboard.writeText(s)} className="text-[11px] text-zinc-500 hover:text-white shrink-0">Copy</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {(mode === "both" || mode === "full") && (
          <div>
            <div className="text-xs font-medium text-zinc-300 mb-2 flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-amber-500 flex items-center justify-center text-[10px] text-black">✦</span> Complete answers
            </div>
            <div className="space-y-2">
              {cur.fullAnswers.map((a, i) => (
                <div key={i} className="bg-white text-zinc-900 rounded-lg px-3 py-2.5 text-sm leading-relaxed flex gap-2">
                  <span className="flex-1">{a}</span>
                  <button onClick={() => navigator.clipboard.writeText(a)} className="text-[11px] bg-zinc-900 text-white px-2 py-1 rounded hover:bg-zinc-800 shrink-0 h-fit">Copy</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {cur !== latest && (
          <button onClick={() => setSelected(items.length - 1)} className="text-xs text-amber-400 hover:underline">→ View latest question</button>
        )}
      </div>
    </div>
  );
}
