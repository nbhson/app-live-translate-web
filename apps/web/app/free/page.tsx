"use client";
import Link from "next/link";
import { useState } from "react";
import { isWebSpeechSupported } from "../../audio/webSpeech";

export default function FreePage() {
  const [copied, setCopied] = useState(false);
  const supported = isWebSpeechSupported();
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6 max-w-3xl mx-auto">
      <Link href="/" className="text-sm text-amber-400 underline">
        ← Quay lại Live Translate
      </Link>
      <h1 className="text-2xl font-semibold mt-4">Free Forever — Thay thế Deepgram (0đ)</h1>
      <p className="text-zinc-400 mt-2 text-sm">
        Kết hợp <b>Option 2: Web Speech API</b> (browser) + <b>Option 3: Self-host faster-whisper</b> để có STT miễn phí vĩnh viễn. Deepgram vẫn là default vì trễ thấp & WER ~9%.
      </p>

      <div className="grid gap-4 mt-6">
        <section className="border border-zinc-800 rounded p-4 bg-zinc-900">
          <h2 className="font-medium">Option 2: Web Speech API (Browser Live)</h2>
          <p className="text-sm text-zinc-400 mt-1">Miễn phí, chạy ngay trong Chrome/Edge, không cần server STT. Chỉ cần chọn provider = Web Speech ở trang chính.</p>
          <ul className="text-sm text-zinc-300 list-disc ml-5 mt-2 space-y-1">
            <li>Trễ ~500ms, độ chính xác 80-85% (EN tốt, VI/JA kém)</li>
            <li>Yêu cầu HTTPS + Chrome desktop, không có diarization</li>
            <li>Phù hợp demo cá nhân, live caption nhanh</li>
          </ul>
          <div className="mt-3 text-xs">
            Trạng thái trình duyệt: {supported ? <span className="text-green-400">✓ Hỗ trợ Web Speech API</span> : <span className="text-red-400">✗ Không hỗ trợ - dùng Chrome</span>}
          </div>
          <Link href="/" className="inline-block mt-3 bg-white text-black px-4 py-2 rounded text-sm">
            Dùng Web Speech ngay →
          </Link>
        </section>

        <section className="border border-zinc-800 rounded p-4 bg-zinc-900">
          <h2 className="font-medium">Option 3: Self-host faster-whisper (Free Forever)</h2>
          <p className="text-sm text-zinc-400 mt-1">Chạy <code className="bg-zinc-800 px-1 rounded">faster-whisper large-v3-turbo + CTranslate2</code> trên GPU, tốn phí infra ~$40/tháng thay vì $774 Deepgram (100 user).</p>
          <ul className="text-sm text-zinc-300 list-disc ml-5 mt-2 space-y-1">
            <li>WER ~10%, 90+ ngôn ngữ, auto-detect, privacy 100%</li>
            <li>Trễ 1.2-2s do giả streaming (buffer 1s + VAD)</li>
            <li>Khuyên khi &gt;500h/tháng theo MAINTENANCE.md</li>
          </ul>
          <pre className="bg-zinc-950 border border-zinc-800 rounded p-3 text-xs mt-3 overflow-auto">
{`# .env
STT_PROVIDER=whisper
# hoặc docker
docker run -p 8000:8000 -e STT_PROVIDER=whisper live-translate-server

# requirements
pip install faster-whisper ctranslate2
# apps/server/src/stt/whisper.py implements STTProvider`}
          </pre>
          <button
            onClick={() => {
              navigator.clipboard.writeText("STT_PROVIDER=whisper");
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="mt-2 border border-zinc-700 px-3 py-1.5 rounded text-xs hover:bg-zinc-800"
          >
            {copied ? "Đã copy!" : "Copy env"}
          </button>
        </section>

        <section className="border border-amber-900/50 bg-amber-950/20 rounded p-4">
          <h2 className="font-medium text-amber-300">Kết hợp 2+3 = Free thay thế Deepgram</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Chọn <b>Web Speech</b> cho live nhanh 0đ, hoặc deploy <b>Whisper self-host</b> cho chất lượng gần Deepgram mà vẫn free sau infra. UI đã có dropdown để switch 1 click.
          </p>
          <div className="flex gap-2 mt-3">
            <Link href="/" className="bg-amber-500 text-black px-4 py-2 rounded text-sm font-medium">
              Quay lại chọn Provider
            </Link>
            <a href="https://github.com/anomalyco/opencode" target="_blank" className="border border-zinc-700 px-4 py-2 rounded text-sm">
              Docs ARCHITECTURE.md
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
