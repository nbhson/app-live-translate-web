"use client";
// Central settings persistence (R2-3).
// Trước đây keys nằm rải rác ở 5 file với 6 format key và validate khác nhau
// (page.tsx parse `lt:prefs` không validate). Mọi read/write đi qua đây:
// - validate từng field (corrupted localStorage -> default, không crash)
// - typed keys, SSR-safe (mọi fn no-op trên server)

export type STTProvider = "deepgram" | "webspeech" | "free";
export type TranslateProvider = "ai" | "mymemory";
export type AudioSource = "mic" | "tab";
export type Theme = "dark" | "light";

export type Settings = {
  sourceLang: string;
  targetLangs: string[];
  sttProvider: STTProvider;
  translateProvider: TranslateProvider;
  audioSource: AudioSource;
  fontSize: number;
  opacity: number;
  theme: Theme;
};

export const DEFAULT_SETTINGS: Settings = {
  sourceLang: "en",
  targetLangs: ["vi"],
  sttProvider: "deepgram",
  translateProvider: "ai",
  audioSource: "tab",
  fontSize: 18,
  opacity: 0.95,
  theme: "dark"
};

const SOURCE_LANGS = new Set(["auto", "en", "vi", "ja", "ko", "zh", "fr", "de", "es"]);
const TARGET_LANGS = new Set(["vi", "en", "ja", "ko", "zh", "fr", "de", "es"]);
const STT_PROVIDERS: STTProvider[] = ["deepgram", "webspeech", "free"];
const TRANSLATE_PROVIDERS: TranslateProvider[] = ["ai", "mymemory"];
const MAX_TARGETS = 3;

export function isSttProvider(v: unknown): v is STTProvider {
  return typeof v === "string" && (STT_PROVIDERS as readonly string[]).includes(v);
}
export function isTranslateProvider(v: unknown): v is TranslateProvider {
  return typeof v === "string" && (TRANSLATE_PROVIDERS as readonly string[]).includes(v);
}
export function isAudioSource(v: unknown): v is AudioSource {
  return v === "mic" || v === "tab";
}

function parseJsonArray(raw: string | null): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Load every persisted setting, validating each field independently. */
export function loadSettings(): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (typeof window === "undefined") return out;
  try {
    const s = localStorage.getItem("lt:sourceLang");
    if (s && SOURCE_LANGS.has(s)) out.sourceLang = s;
    const t: unknown = parseJsonArray(localStorage.getItem("lt:targetLangs"));
    if (Array.isArray(t) && t.length > 0 && t.length <= MAX_TARGETS && t.every((x) => typeof x === "string" && TARGET_LANGS.has(x))) {
      out.targetLangs = t as string[];
    }
    const sp = localStorage.getItem("lt:sttProvider");
    if (isSttProvider(sp)) out.sttProvider = sp;
    const tp = localStorage.getItem("lt:translateProvider");
    if (isTranslateProvider(tp)) out.translateProvider = tp;
    const as = localStorage.getItem("lt:audioSource");
    if (isAudioSource(as)) out.audioSource = as;

    // legacy combined prefs + granular overrides
    const prefs: Record<string, unknown> = parseJsonArray(localStorage.getItem("lt:prefs")) as Record<string, unknown> ?? {};
    const fs = localStorage.getItem("lt:fontSize") ?? prefs.fontSize;
    const fn = typeof fs === "string" ? Number(fs) : fs;
    if (typeof fn === "number" && Number.isFinite(fn) && fn >= 12 && fn <= 40) out.fontSize = fn;
    const op = localStorage.getItem("lt:opacity") ?? prefs.opacity;
    const on = typeof op === "string" ? Number(op) : op;
    if (typeof on === "number" && Number.isFinite(on) && on >= 0.2 && on <= 1) out.opacity = on;
    const th = localStorage.getItem("lt:theme");
    if (th === "dark" || th === "light") out.theme = th;
  } catch { /* corrupted storage — defaults */ }
  return out;
}

/** Persist one field with its canonical key. Unknown keys are ignored. */
export function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  if (typeof window === "undefined") return;
  try {
    switch (key) {
      case "sourceLang": localStorage.setItem("lt:sourceLang", value as string); break;
      case "targetLangs": localStorage.setItem("lt:targetLangs", JSON.stringify(value)); break;
      case "sttProvider": localStorage.setItem("lt:sttProvider", value as string); break;
      case "translateProvider": localStorage.setItem("lt:translateProvider", value as string); break;
      case "audioSource": localStorage.setItem("lt:audioSource", value as string); break;
      case "fontSize": localStorage.setItem("lt:fontSize", String(value)); break;
      case "opacity": localStorage.setItem("lt:opacity", String(value)); break;
      case "theme": localStorage.setItem("lt:theme", value as string); break;
    }
  } catch { /* storage full/blocked */ }
}

// ---------------------------------------------------------------------------
// Language-pair presets — one tap for common conference/interview setups.
// ---------------------------------------------------------------------------
export type LangPreset = { id: string; label: string; sourceLang: string; targets: string[] };

export const LANG_PRESETS: LangPreset[] = [
  { id: "en-vi", label: "EN → VI", sourceLang: "en", targets: ["vi"] },
  { id: "auto-vi-en", label: "Auto → VI + EN", targets: ["vi", "en"], sourceLang: "auto" },
  { id: "ja-vi", label: "JA → VI", sourceLang: "ja", targets: ["vi"] },
  { id: "ko-vi", label: "KO → VI", sourceLang: "ko", targets: ["vi"] },
  { id: "zh-vi", label: "ZH → VI", sourceLang: "zh", targets: ["vi"] },
  { id: "vi-en", label: "VI → EN", sourceLang: "vi", targets: ["en"] }
];

const PRESET_KEY = "lt:langPreset";

export function loadActivePreset(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(PRESET_KEY); } catch { return null; }
}
export function saveActivePreset(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) localStorage.setItem(PRESET_KEY, id);
    else localStorage.removeItem(PRESET_KEY);
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Theme helpers (applied by ThemeToggle + layout bootstrap)
// ---------------------------------------------------------------------------
export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}
