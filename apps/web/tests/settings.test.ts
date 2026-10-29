import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSettings, saveSetting, DEFAULT_SETTINGS,
  loadActivePreset, saveActivePreset, LANG_PRESETS,
  isSttProvider, isTranslateProvider, isAudioSource
} from "../lib/settings";

describe("loadSettings", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults on empty storage", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults on server (no window)", () => {
    // jsdom has window; simulate corrupted values instead
    localStorage.setItem("lt:targetLangs", "not-json");
    localStorage.setItem("lt:prefs", "{broken");
    expect(loadSettings().targetLangs).toEqual(DEFAULT_SETTINGS.targetLangs);
  });

  it("loads valid values", () => {
    localStorage.setItem("lt:sourceLang", "ja");
    localStorage.setItem("lt:targetLangs", JSON.stringify(["vi", "en"]));
    localStorage.setItem("lt:sttProvider", "webspeech");
    localStorage.setItem("lt:translateProvider", "mymemory");
    localStorage.setItem("lt:audioSource", "mic");
    localStorage.setItem("lt:fontSize", "24");
    localStorage.setItem("lt:opacity", "0.5");
    localStorage.setItem("lt:theme", "light");
    const s = loadSettings();
    expect(s.sourceLang).toBe("ja");
    expect(s.targetLangs).toEqual(["vi", "en"]);
    expect(s.sttProvider).toBe("webspeech");
    expect(s.translateProvider).toBe("mymemory");
    expect(s.audioSource).toBe("mic");
    expect(s.fontSize).toBe(24);
    expect(s.opacity).toBe(0.5);
    expect(s.theme).toBe("light");
  });

  it("loads valid targetLangs", () => {
    localStorage.setItem("lt:targetLangs", JSON.stringify(["vi", "en"]));
    expect(loadSettings().targetLangs).toEqual(["vi", "en"]);
  });

  it("rejects invalid targetLangs shapes", () => {
    localStorage.setItem("lt:targetLangs", JSON.stringify(["vi", 42]));
    expect(loadSettings().targetLangs).toEqual(DEFAULT_SETTINGS.targetLangs);
    localStorage.setItem("lt:targetLangs", JSON.stringify(["xx"]));
    expect(loadSettings().targetLangs).toEqual(DEFAULT_SETTINGS.targetLangs);
    localStorage.setItem("lt:targetLangs", JSON.stringify([]));
    expect(loadSettings().targetLangs).toEqual(DEFAULT_SETTINGS.targetLangs);
  });

  it("falls back to legacy lt:prefs for fontSize/opacity", () => {
    localStorage.setItem("lt:prefs", JSON.stringify({ fontSize: 30, opacity: 0.5 }));
    const s = loadSettings();
    expect(s.fontSize).toBe(30);
    expect(s.opacity).toBe(0.5);
  });

  it("rejects out-of-range fontSize/opacity", () => {
    localStorage.setItem("lt:fontSize", "999");
    localStorage.setItem("lt:opacity", "3");
    const s = loadSettings();
    expect(s.fontSize).toBe(DEFAULT_SETTINGS.fontSize);
    expect(s.opacity).toBe(DEFAULT_SETTINGS.opacity);
  });

  it("unknown sourceLang falls back to default", () => {
    localStorage.setItem("lt:sourceLang", "xx");
    expect(loadSettings().sourceLang).toBe("en");
  });
});

describe("saveSetting", () => {
  it("persists each canonical key", () => {
    saveSetting("sourceLang", "ko");
    expect(localStorage.getItem("lt:sourceLang")).toBe("ko");
    saveSetting("targetLangs", ["vi", "en"]);
    expect(JSON.parse(localStorage.getItem("lt:targetLangs")!)).toEqual(["vi", "en"]);
    saveSetting("sttProvider", "webspeech");
    expect(localStorage.getItem("lt:sttProvider")).toBe("webspeech");
    saveSetting("translateProvider", "mymemory");
    expect(localStorage.getItem("lt:translateProvider")).toBe("mymemory");
    saveSetting("audioSource", "mic");
    expect(localStorage.getItem("lt:audioSource")).toBe("mic");
    saveSetting("fontSize", 30);
    expect(localStorage.getItem("lt:fontSize")).toBe("30");
    saveSetting("opacity", 0.7);
    expect(localStorage.getItem("lt:opacity")).toBe("0.7");
    saveSetting("theme", "light");
    expect(localStorage.getItem("lt:theme")).toBe("light");
  });
});

describe("guards", () => {
  it("type guards", () => {
    expect(isSttProvider("deepgram")).toBe(true);
    expect(isSttProvider("nope")).toBe(false);
    expect(isTranslateProvider("ai")).toBe(true);
    expect(isTranslateProvider("gpt")).toBe(false);
    expect(isAudioSource("mic")).toBe(true);
    expect(isAudioSource("webcam")).toBe(false);
  });
});

describe("language presets", () => {
  beforeEach(() => localStorage.clear());
  it("round-trips active preset", () => {
    expect(loadActivePreset()).toBeNull();
    saveActivePreset("en-vi");
    expect(loadActivePreset()).toBe("en-vi");
    saveActivePreset(null);
    expect(loadActivePreset()).toBeNull();
  });
  it("presets have unique ids and valid langs", () => {
    const ids = new Set(LANG_PRESETS.map((p) => p.id));
    expect(ids.size).toBe(LANG_PRESETS.length);
    for (const p of LANG_PRESETS) {
      expect(p.targets.length).toBeGreaterThan(0);
      expect(p.targets.length).toBeLessThanOrEqual(3);
    }
  });
});
