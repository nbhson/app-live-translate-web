"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { CaptionOverlay } from "../components/CaptionOverlay";
import { LanguageSelector } from "../components/LanguageSelector";
import { QuestionSuggest } from "../components/QuestionSuggest";
import { STTProviderSelector, type STTProvider } from "../components/STTProviderSelector";
import { TranslateProviderSelector, type TranslateProvider } from "../components/TranslateProviderSelector";
import { SummaryPanel } from "../components/SummaryPanel";
import { StatsPanel } from "../components/StatsPanel";
import { ThemeToggle } from "../components/ThemeToggle";
import { useLiveCaption } from "../hooks/useLiveCaption";
import { UrlIframePlayer } from "../components/UrlIframePlayer";
import { toSrt, toVtt, toTranscriptText, toMarkdown, downloadText } from "../lib/srt";
import { loadSettings, saveSetting, saveActivePreset, loadActivePreset, LANG_PRESETS, applyTheme } from "../lib/settings";
import { computeStats } from "../lib/stats";

type Tab = "live" | "summary" | "stats" | "history";

/** Sanitized export rows: seq-mapped sentences with real capture timestamps (R2-4). */
function buildExportRows(
  sentences: string[],
  sentenceTs: number[],
  finals: { text: string; language: string; ts: number }[]
): { text: string; language: string; ts: number }[] {
  const seqs = sentences.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  if (seqs.length === 0) return finals;
  // sentenceTs may lag for a seq — chain from the previous known ts so SRT/VTT
  // cues stay monotonic instead of negative (fake `Date.now()+i*1000` cues
  // trước đây sai hoàn toàn so với thời điểm nói).
  let lastTs = 0;
  const rows = seqs.map((seq) => {
    const raw = sentenceTs[seq] ?? 0;
    const ts = raw > lastTs ? raw : lastTs;
    lastTs = ts;
    return { text: sentences[seq], language: "source", ts };
  });
  return rows.filter((r) => r.ts > 0);
}

export default function Home() {
  // ---- settings (R2-3: loadSettings is the single validated source) ----
  const [sourceLang, setSourceLang] = useState("en");
  const [targetLangs, setTargetLangs] = useState<string[]>(["vi"]);
  const [sttProvider, setSttProvider] = useState<STTProvider>("deepgram");
  const [translateProvider, setTranslateProvider] = useState<TranslateProvider>("ai");
  const [audioSource, setAudioSource] = useState<"mic" | "tab">("tab");
  const [fontSize, setFontSize] = useState(18);
  const [opacity, setOpacity] = useState(0.95);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("live");

  // ---- shareable room (feature 1): ?room=<id> in the URL joins a shared room ----
  const [roomId, setRoomId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    const s = loadSettings();
    setSourceLang(s.sourceLang);
    setTargetLangs(s.targetLangs);
    setSttProvider(s.sttProvider);
    setTranslateProvider(s.translateProvider);
    setAudioSource(s.audioSource);
    setFontSize(s.fontSize);
    setOpacity(s.opacity);
    setActivePreset(loadActivePreset());
    applyTheme(s.theme);
    try {
      const room = new URLSearchParams(window.location.search).get("room");
      if (room) setRoomId(room.replace(/[^\w-]/g, "").slice(0, 64) || null);
    } catch { /* no location (SSR) */ }
    setHydrated(true);
  }, []);

  const live = useLiveCaption({ sourceLang, targetLangs, sttProvider, translateProvider, audioSource, roomId: roomId ?? undefined });
  const historyRef = useRef<HTMLDivElement>(null);

  // Persist caption display prefs via the central store (replaces raw lt:prefs JSON)
  useEffect(() => {
    if (!hydrated) return;
    saveSetting("fontSize", fontSize);
    saveSetting("opacity", opacity);
  }, [fontSize, opacity, hydrated]);

  const applyPreset = (id: string) => {
    const p = LANG_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setSourceLang(p.sourceLang);
    setTargetLangs(p.targets);
    setActivePreset(id);
    saveActivePreset(id);
  };

  useEffect(() => {
    const el = historyRef.current;
    if (!el) return;
    const cb = document.getElementById("autoscroll") as HTMLInputElement | null;
    const doScroll = !cb || cb.checked;
    if (doScroll) el.scrollTop = el.scrollHeight;
  }, [live.finals, live.sentences, live.translations, activeTab]);

  const seqs = useMemo(
    () => live.sentences.map((s, idx) => (s ? idx : -1)).filter((i) => i >= 0),
    [live.sentences]
  );

  // ---- exports (feature 3): SRT/VTT with REAL cues + TXT/Markdown/copy ----
  const exportSegments = useMemo(
    () => buildExportRows(live.sentences, live.sentenceTs, live.finals),
    [live.sentences, live.sentenceTs, live.finals]
  );
  // Compact translations to the export row order so cues/translations align
  // (trước đây filter(Boolean) làm lệch index khi seq thưa).
  const exportTranslations = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const tl of targetLangs) {
      map[tl] = exportSegments.map((_, i) => {
        const seq = seqs[i];
        return (seq !== undefined ? live.translations[tl]?.[seq] : undefined) ?? "";
      });
    }
    return map;
  }, [exportSegments, seqs, live.translations, targetLangs]);

  const hasTranscript = exportSegments.length > 0;
  const handleExport = (fmt: "srt" | "vtt" | "txt" | "md") => {
    if (!hasTranscript) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    if (fmt === "srt" || fmt === "vtt") {
      const target = targetLangs[0] ?? "vi";
      const content = fmt === "srt"
        ? toSrt(exportSegments, exportTranslations, target)
        : toVtt(exportSegments as any, exportTranslations, target);
      downloadText(`live-translate-${stamp}.${fmt}`, content);
    } else if (fmt === "txt") {
      downloadText(
        `live-translate-${stamp}.txt`,
        toTranscriptText(exportSegments, live.sentences, live.translations, targetLangs)
      );
    } else {
      downloadText(
        `live-translate-${stamp}.md`,
        toMarkdown(exportSegments, live.sentences, live.translations, targetLangs),
        "text/markdown;charset=utf-8"
      );
    }
  };
  const copyTranscript = async () => {
    if (!hasTranscript) return;
    try {
      await navigator.clipboard.writeText(
        toTranscriptText(exportSegments, live.sentences, live.translations, targetLangs)
      );
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1500);
    } catch { /* clipboard blocked */ }
  };
  const copyRoomLink = async () => {
    if (!roomId) return;
    try {
      const link = `${window.location.origin}/?room=${encodeURIComponent(roomId)}`;
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  const stats = useMemo(
    () => computeStats(live.finals, live.sentences, live.translations),
    [live.finals, live.sentences, live.translations]
  );

  return (
    <main className="h-[100dvh] h-screen flex flex-col overflow-hidden bg-app text-ink">
      {/* Header */}
      <header className="shrink-0 z-30 backdrop-blur-xl bg-app/85 border-b border-line">
        <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-ink text-app flex items-center justify-center font-bold text-sm">LT</div>
              <div>
                <h1 className="text-[15px] font-semibold leading-none tracking-tight">Live Translate</h1>
                <p className="text-[11px] text-faint leading-none mt-0.5">Iframe-first • seq-mapped • live caption + translate</p>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {roomId && (
                <span className="badge badge-green" title="Joined shared room — everyone with this link sees the same captions">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Room: {roomId}
                  <button
                    onClick={copyRoomLink}
                    className="underline underline-offset-2 ml-1 hover:text-emerald-500"
                    aria-label="Copy invite link"
                  >
                    {copiedLink ? "Copied!" : "Copy link"}
                  </button>
                </span>
              )}
              <span className={`badge ${live.isConnected ? "badge-green" : "badge-red"}`} role="status">
                <span className={`w-1.5 h-1.5 rounded-full ${live.isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                {live.isConnected ? "Connected" : "Disconnected"}
              </span>
              {live.isCapturing && <span className="text-[11px] bg-red-600 text-white px-2.5 py-1 rounded-full animate-pulse">● Capturing</span>}
              <ThemeToggle />
            </div>
          </div>
          {/* Options grid */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
            <STTProviderSelector value={sttProvider} onChange={setSttProvider} />
            <TranslateProviderSelector value={translateProvider} onChange={setTranslateProvider} />
            <LanguageSelector
              sourceLang={sourceLang}
              targetLangs={targetLangs}
              onSourceChange={setSourceLang}
              onTargetsChange={setTargetLangs}
            />
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className="label">Presets</span>
              <div className="flex flex-wrap gap-1.5 min-h-[36px] content-start">
                {LANG_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p.id)}
                    className={`badge badge-chip ${activePreset === p.id ? "!border-amber-500 !text-amber-600 dark:!text-amber-400" : ""}`}
                    aria-pressed={activePreset === p.id}
                    title={`Source ${p.sourceLang} → ${p.targets.join(", ")}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <span className="hint">One tap for common conference setups</span>
            </div>
          </div>
        </div>
      </header>

      {/* Control bar */}
      <div className="max-w-[1600px] mx-auto w-full px-4 lg:px-6 pt-3 lg:pt-4 shrink-0">
        <div className="flex flex-wrap gap-2 items-center card p-3">
          {sttProvider === "webspeech" && (
            <div className="flex gap-2 items-center mr-2">
              <span className="text-xs text-dim whitespace-nowrap">Source:</span>
              <select value={audioSource} onChange={e=>setAudioSource(e.target.value as "mic" | "tab")} className="select !w-auto text-xs" aria-label="Audio source">
                <option value="tab">🌐 Tab (incl. iframe)</option>
                <option value="mic">🎙️ Microphone</option>
              </select>
            </div>
          )}
          {!live.isCapturing ? (
            <button onClick={live.startCapture} className="btn-primary">▶ Start</button>
          ) : (
            <button onClick={live.stopCapture} className="btn-danger">■ Stop</button>
          )}
          <button onClick={live.clear} className="btn-ghost">Clear</button>

          <div className="flex gap-1.5 items-center">
            <button onClick={()=>handleExport("srt")} disabled={!hasTranscript} className="btn-ghost btn-sm hidden sm:inline-flex" title="Export subtitles with real cue timings">.srt</button>
            <button onClick={()=>handleExport("vtt")} disabled={!hasTranscript} className="btn-ghost btn-sm hidden sm:inline-flex">.vtt</button>
            <button onClick={()=>handleExport("txt")} disabled={!hasTranscript} className="btn-ghost btn-sm hidden sm:inline-flex" title="Plain transcript">.txt</button>
            <button onClick={()=>handleExport("md")} disabled={!hasTranscript} className="btn-ghost btn-sm hidden sm:inline-flex" title="Markdown transcript with translations">.md</button>
            <button onClick={copyTranscript} disabled={!hasTranscript} className="btn-ghost btn-sm" title="Copy transcript to clipboard">
              {copiedLink ? "✓ Copied" : "⧉ Copy"}
            </button>
          </div>

          <div className="flex items-center gap-3 ml-auto flex-wrap">
            <label className="text-[11px] text-dim flex items-center gap-2">Font <input type="range" min={14} max={26} value={fontSize} onChange={e=>setFontSize(Number(e.target.value))} className="w-20 accent-amber-500" aria-label="Caption font size" /> {fontSize}px</label>
            <label className="text-[11px] text-dim flex items-center gap-2">Opacity <input type="range" min={0.4} max={1} step={0.05} value={opacity} onChange={e=>setOpacity(Number(e.target.value))} className="w-20 accent-amber-500" aria-label="Caption opacity" /> {Math.round(opacity*100)}%</label>
          </div>
        </div>
        {!live.isConnected && (
          <p className="text-xs text-amber-500 mt-2">Not connected to server — run <code className="bg-raise px-1 rounded">pnpm dev:server</code> then reload</p>
        )}
        {live.error && <p className="text-xs text-red-500 mt-2" role="alert">{live.error}</p>}
      </div>

      {/* Main layout — iframe 1.7fr / tabs 1fr (Round-1 layout fix kept) */}
      <div className="max-w-[1600px] mx-auto w-full flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-4 p-4 lg:p-6 overflow-y-auto lg:overflow-hidden lg:items-stretch">
          {/* Left: iframe */}
          <div className="flex flex-col gap-3 min-h-[340px] lg:min-h-0 lg:h-full min-w-0 overflow-hidden">
            <div className="flex-1 min-h-[320px] lg:min-h-0 min-w-0 overflow-hidden">
              <UrlIframePlayer />
            </div>
            <div className="text-[11px] text-faint card p-3 shrink-0 hidden lg:block">
              Tip: use the <b className="text-dim">Side Panel</b> extension → select <b className="text-dim">🌐 Tab + iframe</b> to capture audio without a picker. Regular web Tab falls back to PCM Deepgram automatically.
            </div>
          </div>

          {/* Right: tabbed panel */}
          <div className="flex flex-col gap-3 min-h-[380px] lg:min-h-0 lg:h-full lg:max-h-full min-w-0 overflow-hidden">
            <div className="flex gap-1 card p-1 w-fit shrink-0" role="tablist" aria-label="Panel tabs">
              {([
                ["live", "Live", live.suggestions.length > 0 && <span key="s" className="tab-count bg-amber-500 text-black">{live.suggestions.length}</span>],
                ["summary", "Summary", live.summary && <span key="d" className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />],
                ["stats", "Stats", null],
                ["history", "History", seqs.length > 0 && <span key="h" className="tab-count bg-raise text-dim">{seqs.length}</span>],
              ] as [Tab, string, React.ReactNode][]).map(([tab, label, extra]) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={activeTab === tab}
                  aria-controls={`panel-${tab}`}
                  id={`tab-${tab}`}
                  onClick={() => setActiveTab(tab)}
                  className={`tab flex items-center gap-1.5 ${activeTab === tab ? "tab-active" : ""}`}
                >
                  {label}
                  {extra}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0 flex flex-col overflow-hidden min-w-0">
              {activeTab === "live" ? (
                <div id="panel-live" role="tabpanel" aria-labelledby="tab-live" className="h-full flex flex-col gap-3 min-h-0 overflow-hidden min-w-0">
                  <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
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
                  </div>
                  {live.suggestions.length > 0 && (
                    <div className="shrink-0 h-[380px] lg:h-[360px] min-h-0 overflow-hidden min-w-0">
                      <QuestionSuggest items={live.suggestions} onClear={live.clearSuggestions} />
                    </div>
                  )}
                </div>
              ) : activeTab === "summary" ? (
                <div id="panel-summary" role="tabpanel" aria-labelledby="tab-summary" className="h-full flex flex-col gap-3 min-h-0">
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <SummaryPanel
                      summary={live.summary}
                      chapters={live.chapters}
                      actionItems={live.actionItems}
                      keywords={live.keywords}
                      onRequestSummary={()=>live.requestSummary("full")}
                      isLoading={live.summaryLoading}
                      onCopy={()=> live.summary && navigator.clipboard.writeText(live.summary)}
                    />
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={()=>live.requestSummary("30s")} className="btn-ghost btn-sm">30s</button>
                    <button onClick={()=>live.requestSummary("full")} className="btn-primary btn-sm">Summarize All</button>
                  </div>
                </div>
              ) : activeTab === "stats" ? (
                <div id="panel-stats" role="tabpanel" aria-labelledby="tab-stats" className="h-full min-h-0">
                  <StatsPanel stats={stats} />
                </div>
              ) : (
                <div id="panel-history" role="tabpanel" aria-labelledby="tab-history" className="card overflow-hidden flex flex-col h-full min-h-0">
                  <div className="card-header shrink-0">
                    <h2 className="text-sm font-medium">History</h2>
                    <div className="flex gap-2 lg:gap-3 items-center">
                      <span className="text-xs text-faint hidden sm:inline">{seqs.length ? `${seqs.length} sentences • seq-mapped` : `${live.finals.length} segments`}</span>
                      <label className="text-xs text-dim flex items-center gap-1.5">
                        <input type="checkbox" defaultChecked id="autoscroll" className="accent-amber-500" /> Auto-scroll
                      </label>
                    </div>
                  </div>
                  <div
                    ref={historyRef}
                    className="flex-1 min-h-0 overflow-auto text-sm divide-y divide-line scroll-smooth"
                  >
                    {seqs.length === 0 && live.finals.length === 0 ? (
                      <p className="text-faint p-8 text-center">No transcript yet — press Start and play audio in the iframe</p>
                    ) : seqs.length > 0 ? (
                      seqs.map((seq) => (
                        <div key={seq} className="px-4 py-3 hover:bg-hover/40 transition">
                          <div className="flex gap-2">
                            <span className="text-[11px] text-faint font-mono mt-0.5">#{seq + 1}</span>
                            <div className="flex-1 space-y-1 min-w-0">
                              <div className="seg-source">{live.sentences[seq]}</div>
                              {targetLangs.map((tl) => {
                                const t = live.translations[tl]?.[seq];
                                return (
                                  <div key={tl} className={`seg-translation ${tl === "vi" ? "text-amber-500 dark:text-amber-300" : "text-sky-600 dark:text-sky-300"}`}>
                                    {t ? t : <span className="text-faint italic">… translating</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      live.finals.map((f, i) => (
                        <div key={i} className="px-4 py-3 hover:bg-hover/40 transition">
                          <div className="seg-source">{f.text} <span className="text-xs text-faint">[{f.language}]</span></div>
                          {targetLangs.map((tl) => (
                            <div key={tl} className="seg-translation text-amber-500 dark:text-amber-300">
                              {live.translations[tl]?.[i] ?? <span className="text-faint italic">…</span>}
                            </div>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
