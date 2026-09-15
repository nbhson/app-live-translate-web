"use client";
import { useState, useEffect, useRef } from "react";
import { CaptionOverlay } from "../components/CaptionOverlay";
import { LanguageSelector } from "../components/LanguageSelector";
import { STTProviderSelector, type STTProvider } from "../components/STTProviderSelector";
import { TranslateProviderSelector, type TranslateProvider } from "../components/TranslateProviderSelector";
import { Controls } from "../components/Controls";
import { SummaryPanel } from "../components/SummaryPanel";
import { useLiveCaption } from "../hooks/useLiveCaption";
import { UrlIframePlayer } from "../components/UrlIframePlayer";
import { toSrt, downloadSrt, toVtt } from "../lib/srt";

export default function Home() {
  const [sourceLang, setSourceLang] = useState("en");
  const [targetLangs, setTargetLangs] = useState<string[]>(["vi"]);
  const [sttProvider, setSttProvider] = useState<STTProvider>("deepgram");
  const [translateProvider, setTranslateProvider] = useState<TranslateProvider>("ai");
  const [audioSource, setAudioSource] = useState<"mic" | "tab">("tab");
  const [fontSize, setFontSize] = useState(18);
  const [opacity, setOpacity] = useState(0.95);
  const live = useLiveCaption({ sourceLang, targetLangs, sttProvider, translateProvider, audioSource });
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = historyRef.current;
    if (!el) return;
    const cb = document.getElementById("autoscroll") as HTMLInputElement | null;
    const doScroll = !cb || cb.checked;
    if (doScroll) el.scrollTop = el.scrollHeight;
  }, [live.finals, live.translations]);

  // load preferences per Phase 2 spec
  useEffect(()=>{
    try {
      const s = localStorage.getItem("lt:sourceLang");
      const t = localStorage.getItem("lt:targetLangs");
      const sp = localStorage.getItem("lt:sttProvider") as STTProvider | null;
      const tp = localStorage.getItem("lt:translateProvider") as TranslateProvider | null;
      if (s) setSourceLang(s);
      if (t) setTargetLangs(JSON.parse(t));
      if (sp && ["deepgram","webspeech"].includes(sp)) setSttProvider(sp);
      if (tp && ["ai","mymemory"].includes(tp)) setTranslateProvider(tp);
      const prefs = localStorage.getItem("lt:prefs");
      if (prefs) {
        const p = JSON.parse(prefs);
        if (p.fontSize) setFontSize(p.fontSize);
        if (p.opacity) setOpacity(p.opacity);
      }
    } catch {}
  },[]);
  useEffect(()=>{
    try { localStorage.setItem("lt:prefs", JSON.stringify({ fontSize, opacity })); } catch {}
  },[fontSize, opacity]);

  const handleExport = (fmt:"srt"|"vtt") => {
    if (live.finals.length===0) return;
    const target = targetLangs[0] ?? "vi";
    const content = fmt==="srt" ? toSrt(live.finals, live.translations, target) : toVtt(live.finals, live.translations, target);
    downloadSrt(`live-translate-${Date.now()}.${fmt}`, content);
  };

  return (
    <main className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 p-4 flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold">Live Translate</h1>
        <div className="flex gap-4 flex-wrap items-start">
          <STTProviderSelector value={sttProvider} onChange={setSttProvider} />
          <TranslateProviderSelector value={translateProvider} onChange={setTranslateProvider} />
          <LanguageSelector
            sourceLang={sourceLang}
            targetLangs={targetLangs}
            onSourceChange={setSourceLang}
            onTargetsChange={setTargetLangs}
          />
        </div>
      </header>

      <div className="p-4 border-b border-zinc-800 space-y-4">
        <UrlIframePlayer />
        {sttProvider === "webspeech" && (
          <div className="flex gap-2 items-center">
            <span className="text-xs text-zinc-400">Nguồn Option 2:</span>
            <select value={audioSource} onChange={e=>setAudioSource(e.target.value as any)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs">
              <option value="tab">🌐 Tab (kể cả iframe) - bắt audio đang phát trên tab</option>
              <option value="mic">🎙️ Microphone</option>
            </select>
            <span className="text-[11px] text-zinc-500">Tab = dùng tabCapture (extension) hoặc picker Share audio, bắt cả iframe</span>
          </div>
        )}
        <Controls
          isCapturing={live.isCapturing}
          isConnected={live.isConnected}
          onStart={live.startCapture}
          onStop={live.stopCapture}
          onClear={live.clear}
          onExportSrt={()=>handleExport("srt")}
          onExportVtt={()=>handleExport("vtt")}
          fontSize={fontSize}
          opacity={opacity}
          onFontChange={setFontSize}
          onOpacityChange={setOpacity}
        />
        {!live.isConnected && (
          <p className="text-sm text-amber-400 mt-2">
            Chưa kết nối server. Chạy `pnpm dev:server` và set NEXT_PUBLIC_WS_URL (mặc định ws://localhost:8000)
          </p>
        )}
        {live.error && <p className="text-sm text-red-400 mt-2">{live.error}</p>}
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
        <div className="lg:col-span-2">
          <CaptionOverlay
            interim={live.interim}
            finals={live.finals}
            translations={live.translations}
            detectedLang={live.detectedLang}
            confidence={live.confidence}
            fontSize={fontSize}
            opacity={opacity}
            targetLangs={targetLangs}
          />
        </div>
        <div className="lg:col-span-1">
          <SummaryPanel
            summary={live.summary}
            chapters={live.chapters}
            actionItems={live.actionItems}
            keywords={live.keywords}
            onRequestSummary={()=>live.requestSummary("full")}
            isLoading={live.summaryLoading}
            onCopy={()=> live.summary && navigator.clipboard.writeText(live.summary)}
          />
          <button onClick={()=>live.requestSummary("30s")} className="mt-2 text-xs border border-zinc-700 px-3 py-1.5 rounded">Realtime Summary (30s)</button>
        </div>
      </div>

      <section className="border-t border-zinc-800 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-medium">Lịch sử (IndexedDB + local)</h2>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-zinc-500">{live.finals.length} segments</span>
            <label className="text-xs text-zinc-400 flex items-center gap-1">
              <input type="checkbox" defaultChecked id="autoscroll" /> Auto-scroll
            </label>
          </div>
        </div>
        <div
          ref={historyRef}
          className="max-h-64 overflow-auto text-sm space-y-1 bg-zinc-900 p-3 rounded scroll-smooth"
        >
          {live.finals.length === 0 ? (
            <p className="text-zinc-500">Chưa có transcript</p>
          ) : (
            live.finals.map((f, i) => (
              <div key={i} className="border-b border-zinc-800 pb-1">
                <div className="text-zinc-200">{f.text} <span className="text-xs text-zinc-500">[{f.language}]</span></div>
                {targetLangs.map((tl) => (
                  <div key={tl} className="text-amber-300">
                    [{tl}] {live.translations[tl]?.[i] ?? "..."}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
