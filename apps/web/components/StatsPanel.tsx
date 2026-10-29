"use client";
import type { SessionStats } from "../lib/stats";

function fmtDuration(ms: number): string {
  if (ms <= 0) return "—";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const CARDS: { label: string; value: (s: SessionStats) => string; hint: (s: SessionStats) => string }[] = [
  { label: "Sentences", value: (s) => String(s.sentences || s.segments), hint: () => "seq-mapped segments" },
  { label: "Words", value: (s) => String(s.words), hint: (s) => `${s.chars} chars` },
  { label: "Duration", value: (s) => fmtDuration(s.durationMs), hint: () => "first → last segment" },
  { label: "Speaking pace", value: (s) => (s.wpm > 0 ? `${s.wpm} wpm` : "—"), hint: () => "words / minute" },
  { label: "Questions", value: (s) => String(s.questions), hint: () => "detected by heuristic" },
];

export function StatsPanel({ stats }: { stats: SessionStats }) {
  const empty = stats.segments === 0 && stats.sentences === 0;
  if (empty) {
    return (
      <div className="card flex flex-col items-center justify-center h-full min-h-0 p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-raise border border-line flex items-center justify-center text-2xl mb-4">📊</div>
        <h3 className="font-medium text-ink">No session data yet</h3>
        <p className="text-sm text-dim mt-1 max-w-sm">
          Start a capture session — words, speaking pace, duration and per-language
          translation counts will show up here live.
        </p>
      </div>
    );
  }
  return (
    <div className="card h-full min-h-0 flex flex-col overflow-hidden">
      <div className="card-header shrink-0">
        <h2 className="text-sm font-medium">Session stats</h2>
        <span className="text-xs text-faint">live</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4 scroll-smooth">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {CARDS.map((c) => (
            <div key={c.label} className="rounded-lg border border-line bg-raise p-3">
              <div className="text-[11px] uppercase tracking-wider text-dim">{c.label}</div>
              <div className="text-xl font-semibold text-ink mt-0.5 tabular-nums">{c.value(stats)}</div>
              <div className="text-[11px] text-faint mt-0.5">{c.hint(stats)}</div>
            </div>
          ))}
        </div>

        {stats.languages.length > 0 && (
          <section aria-label="Detected languages">
            <h3 className="label mb-1.5">Detected languages</h3>
            <div className="flex flex-wrap gap-2">
              {stats.languages.map((l) => (
                <span key={l.code} className="badge badge-chip">
                  {l.code} <span className="text-ink font-semibold">{l.segments}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {Object.keys(stats.translationsPerLang).length > 0 && (
          <section aria-label="Translations completed">
            <h3 className="label mb-1.5">Translations completed</h3>
            <div className="space-y-1.5">
              {Object.entries(stats.translationsPerLang).map(([lang, n]) => {
                const total = Math.max(stats.sentences || stats.segments, 1);
                const pct = Math.min(100, Math.round((n / total) * 100));
                return (
                  <div key={lang} className="flex items-center gap-3">
                    <span className="text-xs text-dim w-8 shrink-0">{lang}</span>
                    <div className="flex-1 h-2 rounded-full bg-raise overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${lang} translations`}>
                      <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-dim tabular-nums w-14 text-right">{n}/{total}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
