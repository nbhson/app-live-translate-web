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
    const end = Math.min(nextTs - 200, start + 5000);
    const trans = translations[targetLang]?.[i];
    const body = trans ? `${seg.text}\n${trans}` : seg.text;
    out += `${i+1}\n${fmt(start)} --> ${fmt(end)}\n${body}\n\n`;
  }
  return out;
}

export function downloadSrt(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function toVtt(segments: { text: string; ts:number }[], translations: Record<string,string[]>, targetLang: string): string {
  const srt = toSrt(segments as any, translations, targetLang);
  return "WEBVTT\n\n" + srt.replaceAll(",", ".");
}
