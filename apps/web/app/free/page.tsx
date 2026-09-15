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
        ← Back to Live Translate
      </Link>
      <h1 className="text-2xl font-semibold mt-4">Free Forever — Deepgram Alternative ($0)</h1>
      <p className="text-zinc-400 mt-2 text-sm">
        Combine <b>Option 2: Web Speech API</b> (browser) + <b>Option 3: Self-host faster-whisper</b> for forever-free STT. Deepgram remains default due to low latency & WER ~9%.
      </p>

      <div className="grid gap-4 mt-6">
        <section className="border border-zinc-800 rounded p-4 bg-zinc-900">
          <h2 className="font-medium">Option 2: Web Speech API (Browser Live)</h2>
          <p className="text-sm text-zinc-400 mt-1">Free, runs directly in Chrome/Edge, no STT server needed. Just select provider = Web Speech on the main page.</p>
          <ul className="text-sm text-zinc-300 list-disc ml-5 mt-2 space-y-1">
            <li>Latency ~500ms, accuracy 80-85% (EN good, VI/JA weaker)</li>
            <li>Requires HTTPS + Chrome desktop, no diarization</li>
            <li>Great for personal demo, fast live caption</li>
          </ul>
          <div className="mt-3 text-xs">
            Browser status: {supported ? <span className="text-green-400">✓ Web Speech API supported</span> : <span className="text-red-400">✗ Not supported - use Chrome</span>}
          </div>
          <Link href="/" className="inline-block mt-3 bg-white text-black px-4 py-2 rounded text-sm">
            Use Web Speech now →
          </Link>
        </section>

        <section className="border border-zinc-800 rounded p-4 bg-zinc-900">
          <h2 className="font-medium">Option 3: Self-host faster-whisper (Free Forever)</h2>
          <p className="text-sm text-zinc-400 mt-1">Run <code className="bg-zinc-800 px-1 rounded">faster-whisper large-v3-turbo + CTranslate2</code> on GPU, infra cost ~$40/month vs $774 Deepgram (100 users).</p>
          <ul className="text-sm text-zinc-300 list-disc ml-5 mt-2 space-y-1">
            <li>WER ~10%, 90+ languages, auto-detect, 100% privacy</li>
            <li>Latency 1.2-2s due to pseudo-streaming (buffer 1s + VAD)</li>
            <li>Recommended when &gt;500h/month per MAINTENANCE.md</li>
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
            {copied ? "Copied!" : "Copy env"}
          </button>
        </section>

        <section className="border border-amber-900/50 bg-amber-950/20 rounded p-4">
          <h2 className="font-medium text-amber-300">Combine 2+3 = Free Deepgram Alternative</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Choose <b>Web Speech</b> for fast $0 live, or deploy <b>Whisper self-host</b> for near-Deepgram quality still free after infra. UI has dropdown to switch in 1 click.
          </p>
          <div className="flex gap-2 mt-3">
            <Link href="/" className="bg-amber-500 text-black px-4 py-2 rounded text-sm font-medium">
              Back to Provider selection
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
