// Session stats (R2 feature: stats dashboard).
// Pure functions -> unit-testable without DOM.

import type { FinalSegment } from "./store";

export type SessionStats = {
  segments: number;         // finals count
  sentences: number;        // seq-mapped sentence count
  words: number;            // words in source transcript
  chars: number;            // characters in source transcript
  durationMs: number;       // first -> last segment ts
  wpm: number;              // words per minute (spoken pace)
  questions: number;        // detected questions (heuristic)
  languages: { code: string; segments: number }[]; // per-language segment counts
  translationsPerLang: Record<string, number>;     // completed translations per target
};

const WORD_RE = /\S+/g;

function countWords(text: string): number {
  const m = text.match(WORD_RE);
  return m ? m.length : 0;
}

export function isQuestion(text: string): boolean {
  return /\?\s*$/.test(text.trim());
}

export function computeStats(
  finals: FinalSegment[],
  sentences: string[],
  translations: Record<string, string[]>
): SessionStats {
  const seqs = sentences.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  const transcriptParts = seqs.length > 0 ? seqs.map((i) => sentences[i]) : finals.map((f) => f.text);
  const text = transcriptParts.join(" ");
  const words = countWords(text);

  const tsList = finals.map((f) => f.ts).filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  const durationMs = tsList2Duration(tsList);

  // words/minute over the *captured* window (first->last segment)
  const minutes = durationMs / 60000;
  const wpm = minutes >= 0.05 && transcriptParts.length > 0 ? Math.round(words / minutes) : 0;

  const langCounts = new Map<string, number>();
  for (const f of finals) {
    langCounts.set(f.language, (langCounts.get(f.language) ?? 0) + 1);
  }

  const perLang: Record<string, number> = {};
  for (const [lang, arr] of Object.entries(translations)) {
    perLang[lang] = arr.filter((t) => t && t.trim().length > 0).length;
  }

  return {
    segments: finals.length,
    sentences: seqs.length,
    words,
    chars: text.length,
    durationMs,
    wpm,
    questions: transcriptParts.filter((s) => isQuestion(s)).length,
    languages: [...langCounts.entries()]
      .map(([code, segments]) => ({ code, segments }))
      .sort((a, b) => b.segments - a.segments),
    translationsPerLang: perLang
  };
}

function tsList2Duration(tsList: number[]): number {
  if (tsList.length < 2) return 0;
  return tsList[tsList.length - 1] - tsList[0];
}
