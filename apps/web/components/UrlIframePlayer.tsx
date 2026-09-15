"use client";
import { useState, useEffect, useRef } from "react";

const QUICK_URLS = [
  { label: "YouTube", url: "https://www.youtube.com" },
  { label: "Vimeo", url: "https://vimeo.com" },
  { label: "Demo MP4", url: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" },
];

export function UrlIframePlayer() {
  const [url, setUrl] = useState("");
  const [activeUrl, setActiveUrl] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("lt:iframe:history");
      if (raw) setHistory(JSON.parse(raw).slice(0, 8));
      const last = localStorage.getItem("lt:iframe:last");
      if (last) { setUrl(last); }
    } catch {}
  }, []);

  const persistHistory = (u: string) => {
    try {
      const next = [u, ...history.filter((x) => x !== u)].slice(0, 8);
      setHistory(next);
      localStorage.setItem("lt:iframe:history", JSON.stringify(next));
      localStorage.setItem("lt:iframe:last", u);
    } catch {}
  };

  const normalizeUrl = (raw: string) => {
    let u = raw.trim();
    if (!u) return "";
    if (!u.startsWith("http")) u = "https://" + u;
    try {
      const parsed = new URL(u);
      if (parsed.hostname.includes("youtube.com") && parsed.searchParams.get("v")) {
        const v = parsed.searchParams.get("v");
        u = `https://www.youtube.com/embed/${v}?autoplay=1&enablejsapi=1&playsinline=1`;
      } else if (parsed.hostname.includes("youtu.be")) {
        const id = parsed.pathname.slice(1).split("?")[0];
        u = `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1`;
      }
    } catch {}
    return u;
  };

  const handleLoad = (override?: string) => {
    const raw = override ?? url;
    const u = normalizeUrl(raw);
    if (!u) return;
    setActiveUrl(u);
    persistHistory(u);
  };

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div ref={wrapRef} className={`flex flex-col bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden min-h-0 h-full ${isFullscreen ? "bg-black" : ""}`}>
      {/* toolbar */}
      <div className="flex flex-col gap-3 p-3 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">🌐</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Dán URL video / website (youtube.com, vimeo, mp4, meet...) + Enter"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2.5 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
              onKeyDown={(e) => e.key === "Enter" && handleLoad()}
            />
          </div>
          <button onClick={() => handleLoad()} className="bg-white text-black px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-zinc-200 transition">
            Load
          </button>
          {activeUrl && (
            <>
              <button
                onClick={toggleFullscreen}
                className="border border-zinc-700 bg-zinc-800 px-3 py-2.5 rounded-lg text-sm hover:bg-zinc-700 transition"
                title="Fullscreen"
              >
                ⛶
              </button>
              <a href={activeUrl} target="_blank" rel="noreferrer" className="border border-zinc-700 px-3 py-2.5 rounded-lg text-sm hover:bg-zinc-800 transition hidden sm:inline-flex items-center">
                ↗
              </a>
              <button onClick={() => setActiveUrl("")} className="border border-zinc-700 px-3 py-2.5 rounded-lg text-sm hover:bg-zinc-800 transition">
                ✕
              </button>
            </>
          )}
        </div>

        {!activeUrl && (
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-[11px] text-zinc-500">Gợi ý:</span>
            {QUICK_URLS.map((q) => (
              <button key={q.label} onClick={() => { setUrl(q.url); handleLoad(q.url); }} className="text-[11px] px-2.5 py-1 rounded-full border border-zinc-700 hover:bg-zinc-800 text-zinc-300 transition">
                {q.label}
              </button>
            ))}
            {history.length > 0 && (
              <>
                <span className="text-[11px] text-zinc-600 ml-2">Gần đây:</span>
                {history.slice(0, 4).map((h) => (
                  <button key={h} onClick={() => { setUrl(h); handleLoad(h); }} className="text-[11px] px-2 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 truncate max-w-[160px] text-zinc-400">
                    {(() => { try { return new URL(h).hostname; } catch { return h.slice(0,20);} })()}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Iframe chạy với <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-300">allow="microphone; camera; display-capture"</code> — audio trong iframe vẫn là <b className="text-zinc-300">tab audio</b>. Dùng <b className="text-zinc-300">Bắt đầu</b> với nguồn <b className="text-zinc-300">Tab</b> (extension Side Panel hoặc picker Share audio) để caption & dịch.
          {activeUrl.includes("youtube.com/embed") && <span className="ml-2 text-amber-400">YouTube embed đã bật autoplay.</span>}
        </p>
      </div>

      {/* iframe area */}
      {activeUrl ? (
        <div className="relative bg-black flex-1 min-h-[280px] lg:min-h-0">
          <iframe
            src={activeUrl}
            className="w-full h-full absolute inset-0"
            allow="autoplay; encrypted-media; fullscreen; microphone; camera; display-capture; clipboard-read; clipboard-write; geolocation; picture-in-picture"
            allowFullScreen
          />
          {/* floating badge */}
          <div className="absolute top-3 left-3 flex gap-2">
            <span className="text-[11px] bg-black/70 backdrop-blur border border-white/10 text-white px-2.5 py-1 rounded-full">▶ Iframe active</span>
            <span className="hidden sm:inline text-[11px] bg-emerald-600/90 text-white px-2.5 py-1 rounded-full">Tab audio → caption đang bắt</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-[280px] lg:min-h-0 flex flex-col items-center justify-center py-10 px-6 text-center bg-gradient-to-b from-zinc-900 to-zinc-950">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-2xl mb-4">🖥️</div>
          <h3 className="font-medium text-zinc-200">Chưa có nguồn phát</h3>
          <p className="text-sm text-zinc-500 mt-1 max-w-[420px]">Dán URL video/meeting/website ở trên để load iframe. Caption và dịch sẽ bám theo audio của iframe (tab audio) — không cần mic.</p>
        </div>
      )}
    </div>
  );
}
