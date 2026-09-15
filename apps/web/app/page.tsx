"use client";
import { useState, useEffect, useRef } from "react";
import { CaptionOverlay } from "../components/CaptionOverlay";
import { LanguageSelector } from "../components/LanguageSelector";
import { STTProviderSelector, type STTProvider } from "../components/STTProviderSelector";
import { TranslateProviderSelector, type TranslateProvider } from "../components/TranslateProviderSelector";
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
  }, [live.finals, live.sentences, live.translations]);

  useEffect(()=>{
    try {
      const s = localStorage.getItem("lt:sourceLang");
      const t = localStorage.getItem("lt:targetLangs");
      const sp = localStorage.getItem("lt:sttProvider") as STTProvider | null;
      const tp = localStorage.getItem("lt:translateProvider") as TranslateProvider | null;
      if (s) setSourceLang(s);
      if (t) setTargetLangs(JSON.parse(t));
      if (sp && ["deepgram","webspeech","free"].includes(sp)) setSttProvider(sp as STTProvider);
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
    const hasSent = live.sentences.filter(Boolean).length > 0;
    const finalsForExport = hasSent
      ? live.sentences.filter(Boolean).map((t, i) => ({ text: t, language: sourceLang, ts: Date.now() + i * 1000 }))
      : live.finals;
    if (finalsForExport.length===0) return;
    const target = targetLangs[0] ?? "vi";
    const content = fmt==="srt" ? toSrt(finalsForExport as any, live.translations, target) : toVtt(finalsForExport as any, live.translations, target);
    downloadSrt(`live-translate-${Date.now()}.${fmt}`, content);
  };

  const seqs = live.sentences.map((s, idx) => (s ? idx : -1)).filter((i) => i >= 0);

  return (
    <main className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* Header - sticky, glass */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-zinc-950/85 border-b border-zinc-800">
        <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-3">
          {/* Top bar: brand + status */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white text-black flex items-center justify-center font-bold text-sm">LT</div>
              <div>
                <h1 className="text-[15px] font-semibold leading-none tracking-tight">Live Translate</h1>
                <p className="text-[11px] text-zinc-500 leading-none mt-0.5">Iframe-first • EN → VI • seq-mapped</p>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border ${live.isConnected ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${live.isConnected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
                {live.isConnected ? "Connected" : "Disconnected"}
              </span>
              {live.isCapturing && <span className="text-[11px] bg-red-600 text-white px-2.5 py-1 rounded-full animate-pulse">● Capturing</span>}
            </div>
          </div>
          {/* Options grid: 4 equal columns */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
            <STTProviderSelector value={sttProvider} onChange={setSttProvider} />
            <TranslateProviderSelector value={translateProvider} onChange={setTranslateProvider} />
            <LanguageSelector
              sourceLang={sourceLang}
              targetLangs={targetLangs}
              onSourceChange={setSourceLang}
              onTargetsChange={setTargetLangs}
            />
          </div>
        </div>
      </header>

      {/* Control bar */}
      <div className="max-w-[1600px] mx-auto w-full px-4 lg:px-6 pt-4">
        <div className="flex flex-wrap gap-2 items-center bg-zinc-900 border border-zinc-800 rounded-xl p-3">
          {sttProvider === "webspeech" && (
            <div className="flex gap-2 items-center mr-2">
              <span className="text-xs text-zinc-400 whitespace-nowrap">Nguồn:</span>
              <select value={audioSource} onChange={e=>setAudioSource(e.target.value as any)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs">
                <option value="tab">🌐 Tab (kể cả iframe)</option>
                <option value="mic">🎙️ Microphone</option>
              </select>
            </div>
          )}
          {!live.isCapturing ? (
            <button onClick={live.startCapture} className="bg-white text-black px-5 py-2 rounded-lg font-semibold hover:bg-zinc-200 transition text-sm">▶ Bắt đầu</button>
          ) : (
            <button onClick={live.stopCapture} className="bg-red-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-red-700 transition text-sm">■ Dừng</button>
          )}
          <button onClick={live.clear} className="border border-zinc-700 bg-zinc-800 px-4 py-2 rounded-lg text-sm hover:bg-zinc-700 transition">Xóa</button>
          <button onClick={()=>handleExport("srt")} className="border border-zinc-700 px-4 py-2 rounded-lg text-sm hover:bg-zinc-800 transition hidden sm:inline-flex">.srt</button>
          <button onClick={()=>handleExport("vtt")} className="border border-zinc-700 px-4 py-2 rounded-lg text-sm hover:bg-zinc-800 transition hidden sm:inline-flex">.vtt</button>

          <div className="flex items-center gap-3 ml-auto flex-wrap">
            <label className="text-[11px] text-zinc-400 flex items-center gap-2">Font <input type="range" min={14} max={26} value={fontSize} onChange={e=>setFontSize(Number(e.target.value))} className="w-20 accent-white" /> {fontSize}px</label>
            <label className="text-[11px] text-zinc-400 flex items-center gap-2">Opacity <input type="range" min={0.4} max={1} step={0.05} value={opacity} onChange={e=>setOpacity(Number(e.target.value))} className="w-20 accent-white" /> {Math.round(opacity*100)}%</label>
          </div>
        </div>
        {!live.isConnected && (
          <p className="text-xs text-amber-400 mt-2">Chưa kết nối server — chạy <code className="bg-zinc-800 px-1 rounded">pnpm dev:server</code> và <code className="bg-zinc-800 px-1 rounded">ws://localhost:8000</code></p>
        )}
        {live.error && <p className="text-xs text-red-400 mt-2">{live.error}</p>}
      </div>

      {/* Main iframe-first layout */}
      <div className="max-w-[1600px] mx-auto w-full flex-1 grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-4 p-4 lg:p-6">
        {/* Left: Iframe dominant */}
        <div className="flex flex-col gap-4 min-h-[520px]">
          <UrlIframePlayer />
          <div className="text-[11px] text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            Mẹo: Dùng extension <b className="text-zinc-300">Side Panel</b> → chọn <b className="text-zinc-300">🌐 Tab + iframe</b> để bắt audio không cần picker. Web thường Tab sẽ fallback sang PCM Deepgram tự động.
          </div>
        </div>

        {/* Right: Caption + Summary */}
        <div className="flex flex-col gap-4">
          <CaptionOverlay
            interim={live.interim}
            finals={live.finals}
            sentences={live.sentences}
            translations={live.translations}
            detectedLang={live.detectedLang}
            confidence={live.confidence}
            fontSize={fontSize}
            opacity={opacity}
            targetLangs={targetLangs}
          />
          <SummaryPanel
            summary={live.summary}
            chapters={live.chapters}
            actionItems={live.actionItems}
            keywords={live.keywords}
            onRequestSummary={()=>live.requestSummary("full")}
            isLoading={live.summaryLoading}
            onCopy={()=> live.summary && navigator.clipboard.writeText(live.summary)}
          />
          <button onClick={()=>live.requestSummary("30s")} className="text-xs border border-zinc-700 bg-zinc-900 px-3 py-2 rounded-lg hover:bg-zinc-800 transition">Realtime Summary (30s)</button>
        </div>
      </div>

      {/* History - seq-mapped */}
      <section className="max-w-[1600px] mx-auto w-full px-4 lg:px-6 pb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h2 className="text-sm font-medium">Lịch sử</h2>
            <div className="flex gap-3 items-center">
              <span className="text-xs text-zinc-500">{seqs.length ? `${seqs.length} câu • seq-mapped` : `${live.finals.length} segments`}</span>
              <label className="text-xs text-zinc-400 flex items-center gap-1.5">
                <input type="checkbox" defaultChecked id="autoscroll" className="accent-white" /> Auto-scroll
              </label>
            </div>
          </div>
          <div
            ref={historyRef}
            className="max-h-[320px] overflow-auto text-sm divide-y divide-zinc-800 scroll-smooth"
          >
            {seqs.length === 0 && live.finals.length === 0 ? (
              <p className="text-zinc-500 p-8 text-center">Chưa có transcript — bấm Bắt đầu và phát audio trong iframe</p>
            ) : seqs.length > 0 ? (
              seqs.map((seq) => (
                <div key={seq} className="px-4 py-3 hover:bg-zinc-800/50 transition">
                  <div className="flex gap-2">
                    <span className="text-[11px] text-zinc-500 font-mono mt-0.5">#{seq + 1}</span>
                    <div className="flex-1 space-y-1">
                      <div className="text-zinc-100 leading-relaxed">{live.sentences[seq]}</div>
                      {targetLangs.map((tl) => {
                        const t = live.translations[tl]?.[seq];
                        return (
                          <div key={tl} className={`text-[13px] leading-relaxed ${tl === "vi" ? "text-amber-300" : "text-sky-300"}`}>
                            {t ? t : <span className="text-zinc-500 italic">… đang dịch</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              live.finals.map((f, i) => (
                <div key={i} className="px-4 py-3 hover:bg-zinc-800/50 transition">
                  <div className="text-zinc-200">{f.text} <span className="text-xs text-zinc-500">[{f.language}]</span></div>
                  {targetLangs.map((tl) => (
                    <div key={tl} className="text-amber-300 text-[13px]">
                      {live.translations[tl]?.[i] ?? <span className="text-zinc-500 italic">…</span>}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
