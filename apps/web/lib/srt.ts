export type SrtSegment = { idx: number; startMs: number; endMs: number; text: string; translation?: string };

function fmt(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const rem = ms % 1000;
  const pad = (n:number,l=2)=> n.toString().padStart(l,"0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(rem,3)}`;
}

export function toSrt(segments: { text: string; language: string; ts: number }[], translations: Record<string,string[]>, targetLang: string): string {
  let out = "";
  const startBase = segments[0]?.ts ?? Date.now();
  for (let i=0;i<segments.length;i++) {
    const seg = segments[i];
    const start = seg.ts - startBase;
    const nextTs = segments[i+1]?.ts ?? seg.ts + 3000;
    // Clamp end >= start + 1: timestamps sát nhau trước đây cho end < start
    // (cue duration âm = SRT/VTT không hợp lệ, player skip cả cue).
    const end = Math.max(start + 1, Math.min(nextTs - 200, start + 5000));
    const trans = translations[targetLang]?.[i];
    const body = trans ? `${seg.text}\n${trans}` : seg.text;
    out += `${i+1}\n${fmt(start)} --> ${fmt(end)}\n${body}\n\n`;
  }
  return out;
}

export function downloadSrt(filename: string, content: string) {
  downloadText(filename, content);
}

export function toVtt(segments: { text: string; ts:number }[], translations: Record<string,string[]>, targetLang: string): string {
  const srt = toSrt(segments as any, translations, targetLang);
  // Chỉ đổi dấu ',' trong TIMESTAMP (dòng chứa "-->") thành '.': replaceAll
  // trên toàn bộ text trước đây biến dấu phẩy TRONG nội dung caption thành chấm.
  return "WEBVTT\n\n" + srt.replace(/^(\d{2}:\d{2}:\d{2}),(\d{3}) --> (\d{2}:\d{2}:\d{2}),(\d{3})$/gm, "$1.$2 --> $3.$4");
}

// ---------------------------------------------------------------------------
// Transcript export (R2 feature): plain text + Markdown với bản dịch
// ---------------------------------------------------------------------------

/** Plain transcript: one paragraph per segment, translations as indented lines. */
export function toTranscriptText(
  segments: { text: string; language: string }[],
  sentences: string[],
  translations: Record<string, string[]>,
  targetLangs: string[]
): string {
  const seqs = sentences.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  const rows = seqs.length > 0
    ? seqs.map((i) => ({ idx: i, text: sentences[i] }))
    : segments.map((s, i) => ({ idx: i, text: s.text }));
  const lines: string[] = [];
  for (const r of rows) {
    lines.push(r.text);
    for (const tl of targetLangs) {
      const t = translations[tl]?.[r.idx];
      if (t) lines.push(`  ${t}`);
    }
  }
  return lines.join("\n\n");
}

/** Markdown transcript with timestamps + per-language sections. */
export function toMarkdown(
  segments: { text: string; language: string; ts: number }[],
  sentences: string[],
  translations: Record<string, string[]>,
  targetLangs: string[]
): string {
  const seqs = sentences.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  const out: string[] = ["# Live Translate — Transcript", ""];
  const rows = seqs.length > 0
    ? seqs.map((i) => ({ idx: i, text: sentences[i] }))
    : segments.map((s, i) => ({ idx: i, text: s.text }));
  if (rows.length === 0) return out.join("\n");
  for (const r of rows) {
    out.push(`**#${r.idx + 1}** ${r.text}`);
    for (const tl of targetLangs) {
      const t = translations[tl]?.[r.idx];
      if (t) out.push(`- **${tl}**: ${t}`);
    }
    out.push("");
  }
  return out.join("\n");
}

export function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
