"use client";
import { create } from "zustand";

export type FinalSegment = { text: string; language: string; ts: number };

type CaptionState = {
  interim: string;
  finals: FinalSegment[];
  translations: Record<string, string[]>;
  detectedLang?: string;
  sourceLang: string;
  targetLangs: string[];
  // UI controls
  fontSize: number;
  opacity: number;
  position: { x: number; y: number };
  isDragging: boolean;
  // actions
  setInterim: (t: string) => void;
  addFinal: (seg: FinalSegment) => void;
  addTranslation: (targetLang: string, text: string) => void;
  setDetectedLang: (l?: string) => void;
  setLangs: (src: string, tgts: string[]) => void;
  clear: () => void;
  setFontSize: (n: number) => void;
  setOpacity: (n: number) => void;
  setPosition: (p: { x: number; y: number }) => void;
};

export const useCaptionStore = create<CaptionState>((set) => ({
  interim: "",
  finals: [],
  translations: {},
  detectedLang: undefined,
  sourceLang: "en",
  targetLangs: ["vi"],
  fontSize: 18,
  opacity: 0.95,
  position: { x: 0, y: 0 },
  isDragging: false,

  setInterim: (interim) => set({ interim }),
  addFinal: (seg) => set((s) => ({ finals: [...s.finals, seg], interim: "" })),
  addTranslation: (targetLang, text) =>
    set((s) => ({
      translations: { ...s.translations, [targetLang]: [...(s.translations[targetLang] ?? []), text] }
    })),
  setDetectedLang: (detectedLang) => set({ detectedLang }),
  setLangs: (sourceLang, targetLangs) => set({ sourceLang, targetLangs }),
  clear: () => set({ interim: "", finals: [], translations: {}, detectedLang: undefined }),
  setFontSize: (fontSize) => set({ fontSize }),
  setOpacity: (opacity) => set({ opacity }),
  setPosition: (position) => set({ position })
}));

// Persist preferences to localStorage (called from component)
export function loadPreferences(): { sourceLang: string; targetLangs: string[]; fontSize: number; opacity: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("lt:prefs");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function savePreferences(p: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  localStorage.setItem("lt:prefs", JSON.stringify(p));
}
