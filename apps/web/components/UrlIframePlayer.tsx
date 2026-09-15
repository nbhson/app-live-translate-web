"use client";
import { useState } from "react";

export function UrlIframePlayer() {
  const [url, setUrl] = useState("");
  const [activeUrl, setActiveUrl] = useState("");

  const handleLoad = () => {
    let u = url.trim();
    if (!u) return;
    if (!u.startsWith("http")) u = "https://" + u;
    // Youtube watch -> embed
    try {
      const parsed = new URL(u);
      if (parsed.hostname.includes("youtube.com") && parsed.searchParams.get("v")) {
        const v = parsed.searchParams.get("v");
        u = `https://www.youtube.com/embed/${v}?autoplay=1&enablejsapi=1`;
      } else if (parsed.hostname.includes("youtu.be")) {
        const id = parsed.pathname.slice(1);
        u = `https://www.youtube.com/embed/${id}?autoplay=1`;
      }
    } catch {}
    setActiveUrl(u);
  };

  return (
    <div className="border border-zinc-800 rounded p-3 bg-zinc-900">
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Nhập URL (youtube.com, mp3, mp4...) rồi Enter"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
          onKeyDown={(e) => e.key === "Enter" && handleLoad()}
        />
        <button onClick={handleLoad} className="bg-white text-black px-4 py-2 rounded text-sm font-medium">
          Load iframe
        </button>
        {activeUrl && (
          <button onClick={() => setActiveUrl("")} className="border border-zinc-700 px-3 py-2 rounded text-sm">
            Xóa
          </button>
        )}
      </div>
      <p className="text-[11px] text-zinc-500 mt-2">
        Âm thanh phát trong iframe vẫn là tab audio → Option 2 (Web Speech) với nguồn <b>Tab</b> sẽ bắt được (qua tabCapture/getDisplayMedia), không cần mic.
      </p>
      {activeUrl && (
        <div className="mt-3">
          <iframe
            src={activeUrl}
            className="w-full h-[300px] rounded border border-zinc-700"
            allow="autoplay; encrypted-media; fullscreen; microphone; camera; display-capture; clipboard-read; clipboard-write; geolocation"
            allowFullScreen
          />
        </div>
      )}
    </div>
  );
}
