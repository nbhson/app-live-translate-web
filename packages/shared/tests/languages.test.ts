import { describe, it, expect } from "vitest";
import { SUPPORTED_SOURCE_LANGUAGES, SUPPORTED_TARGET_LANGUAGES, isPunctuationLang, getLangLabel } from "../src/languages";

describe("languages", () => {
  it("has expected source languages", () => {
    const codes = SUPPORTED_SOURCE_LANGUAGES.map(l=>l.code);
    expect(codes).toContain("en");
    expect(codes).toContain("vi");
    expect(codes).toContain("auto");
    expect(codes).toContain("ja");
    expect(codes).toHaveLength(9);
  });
  it("has expected target languages", () => {
    const codes = SUPPORTED_TARGET_LANGUAGES.map(l=>l.code);
    expect(codes).toContain("vi");
    expect(codes).toContain("en");
    expect(codes).not.toContain("auto");
  });
  it("isPunctuationLang correct", () => {
    expect(isPunctuationLang("fr")).toBe(true);
    expect(isPunctuationLang("de")).toBe(true);
    expect(isPunctuationLang("es")).toBe(true);
    expect(isPunctuationLang("ko")).toBe(false);
  });
  it("getLangLabel returns nativeLabel or code", () => {
    expect(getLangLabel("en")).toBe("Tiếng Anh");
    expect(getLangLabel("ja")).toBe("日本語");
    expect(getLangLabel("unknown")).toBe("unknown");
  });
  it("all langs have nativeLabel", () => {
    for(const l of [...SUPPORTED_SOURCE_LANGUAGES, ...SUPPORTED_TARGET_LANGUAGES]){
      expect(l.nativeLabel).toBeTruthy();
      expect(l.label).toBeTruthy();
    }
  });
});

describe("types re-export", () => {
  it("exports via index", async () => {
    const mod = await import("../src/index");
    expect(mod.isPunctuationLang).toBeDefined();
    expect(mod.splitByPunctuation).toBeDefined();
  });
});
