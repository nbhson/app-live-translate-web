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
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) setHistory((parsed as string[]).slice(0, 8));
      }
      const last = localStorage.getItem("lt:iframe:last");
      if (last) { setUrl(last); }
    } catch { /* corrupted storage — start empty */ }
  }, []);

  const persistHistory = (u: string) => {
    try {
      const next = [u, ...history.filter((x) => x !== u)].slice(0, 8);
      setHistory(next);
      localStorage.setItem("lt:iframe:history", JSON.stringify(next));
      localStorage.setItem("lt:iframe:last", u);
    } catch { /* storage full/blocked */ }
  };

  const normalizeUrl = (raw: string) => {
    let u = raw.trim();
    if (!u) return "";
    if (!u.startsWith("http")) u = "https://" + u;
    try {
      const parsed = new URL(u);
      // Chỉ http(s) — chặn javascript:/data: URL trong iframe
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
      if (parsed.hostname.includes("youtube.com") && parsed.searchParams.get("v")) {
        const v = parsed.searchParams.get("v");
        u = `https://www.youtube.com/embed/${v}?autoplay=1&enablejsapi=1&playsinline=1`;
      } else if (parsed.hostname.includes("youtu.be")) {
        const id = parsed.pathname.slice(1).split("?")[0];
        u = `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1`;
      }
    } catch { return ""; }
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
    <div ref={wrapRef} className={`flex flex-col card overflow-hidden min-h-0 h-full ${isFullscreen ? "bg-black" : ""}`}>
      {/* toolbar */}
      <div className="flex flex-col gap-3 p-3 border-b border-line shrink-0">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint text-sm">🌐</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste video / website URL (youtube.com, vimeo, mp4, meet...) + Enter"
              className="input-lg"
              aria-label="Source URL"
              onKeyDown={(e) => e.key === "Enter" && handleLoad()}
            />
          </div>
          <button onClick={() => handleLoad()} className="btn-primary">Load</button>
          {activeUrl && (
            <>
              <button onClick={toggleFullscreen} className="icon-btn" title="Fullscreen" aria-label="Toggle fullscreen">⛶</button>
              <a href={activeUrl} target="_blank" rel="noreferrer" className="icon-btn hidden sm:inline-flex items-center" title="Open in new tab" aria-label="Open source in a new tab">↗</a>
              <button onClick={() => setActiveUrl("")} className="icon-btn" title="Close" aria-label="Close embedded source">✕</button>
            </>
          )}
        </div>

        {!activeUrl && (
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-[11px] text-faint">Suggestions:</span>
            {QUICK_URLS.map((q) => (
              <button key={q.label} onClick={() => { setUrl(q.url); handleLoad(q.url); }} className="badge badge-chip">{q.label}</button>
            ))}
            {history.length > 0 && (
              <>
                <span className="text-[11px] text-faint ml-2">Recent:</span>
                {history.slice(0, 4).map((h) => (
                  <button key={h} onClick={() => { setUrl(h); handleLoad(h); }} className="badge badge-chip truncate max-w-[160px]">
                    {(() => { try { return new URL(h).hostname; } catch { return h.slice(0,20);} })()}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        <p className="text-[11px] text-faint leading-relaxed">
          The iframe runs in a <code className="bg-raise px-1 py-0.5 rounded">sandbox</code> (no microphone/camera) — audio in the iframe is still <b className="text-dim">tab audio</b>. Use <b className="text-dim">Start</b> with source <b className="text-dim">Tab</b> (extension Side Panel or Share-audio picker) for caption &amp; translate.
          {activeUrl.includes("youtube.com/embed") && <span className="ml-2 text-amber-500">YouTube embed autoplay enabled.</span>}
        </p>
      </div>

      {/* iframe area */}
      {activeUrl ? (
        <div className="relative bg-black flex-1 min-h-[280px] lg:min-h-0">
          <iframe
            src={activeUrl}
            className="w-full h-full absolute inset-0"
            // Bỏ camera/clipboard-read/write/geolocation — URL do user paste BẤT
            // KỲ: trang độc được cấp camera/mic/clipboard là rủi ro lớn. Giữ
            // những gì use-case thực sự cần (âm thanh: autoplay + encrypted-media).
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            // sandbox + allow-same-origin đồng thời = gần như không sandbox;
            // nếu cần same-origin (nghe tab audio vẫn hoạt động vì tab capture
            // là cấp browser) thì review kỹ từng site. Ưu tiên an toàn.
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
            title="Embedded media player"
            allowFullScreen
          />
          <div className="absolute top-3 left-3 flex gap-2">
            <span className="text-[11px] bg-black/70 backdrop-blur border border-white/10 text-white px-2.5 py-1 rounded-full">▶ Iframe active</span>
            <span className="hidden sm:inline text-[11px] bg-emerald-600/90 text-white px-2.5 py-1 rounded-full">Tab audio → caption active</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-[280px] lg:min-h-0 flex flex-col items-center justify-center py-10 px-6 text-center bg-gradient-to-b from-surface to-app">
          <div className="w-16 h-16 rounded-2xl bg-raise border border-line flex items-center justify-center text-2xl mb-4">🖥️</div>
          <h3 className="font-medium text-ink">No source yet</h3>
          <p className="text-sm text-dim mt-1 max-w-[420px]">Paste a video/meeting/website URL above to load the iframe. Captions and translation will follow the iframe audio (tab audio) — no mic needed.</p>
        </div>
      )}
    </div>
  );
}
