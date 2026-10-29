import { describe, it, expect } from "vitest";
import { computeStats, isQuestion } from "../lib/stats";
import type { FinalSegment } from "../lib/store";

const seg = (text: string, language = "en", ts = 0): FinalSegment => ({ text, language, ts });

describe("isQuestion", () => {
  it("detects trailing question marks", () => {
    expect(isQuestion("What time is it?")).toBe(true);
    expect(isQuestion("  Who knows?  ")).toBe(true);
    expect(isQuestion("This is a statement.")).toBe(false);
    expect(isQuestion("")).toBe(false);
  });
});

describe("computeStats", () => {
  it("returns zeros for an empty session", () => {
    const s = computeStats([], [], {});
    expect(s.segments).toBe(0);
    expect(s.words).toBe(0);
    expect(s.durationMs).toBe(0);
    expect(s.wpm).toBe(0);
    expect(s.questions).toBe(0);
    expect(s.languages).toEqual([]);
    expect(s.translationsPerLang).toEqual({});
  });

  it("computes words, duration and wpm", () => {
    const finals = [
      seg("Hello world how are you", "en", 0),
      seg("I am fine thanks", "en", 60_000),
    ];
    const s = computeStats(finals, [], {});
    expect(s.segments).toBe(2);
    expect(s.words).toBe(9);
    expect(s.durationMs).toBe(60_000);
    expect(s.wpm).toBe(9); // 9 words / 1 minute
    expect(s.chars).toBe(finals.map((f) => f.text).join(" ").length);
  });

  it("prefers seq-mapped sentences over raw finals", () => {
    const finals = [seg("one two", "en", 0)];
    const sentences = ["", "the mapped sentence here"];
    const s = computeStats(finals, sentences, {});
    expect(s.sentences).toBe(1);
    expect(s.words).toBe(4);
  });

  it("counts questions and languages", () => {
    const finals = [
      seg("What is this?", "en", 0),
      seg("これは質問ですか", "ja", 1000),
      seg("Another one?", "en", 2000),
    ];
    const s = computeStats(finals, [], {});
    expect(s.questions).toBe(2);
    expect(s.languages).toEqual([
      { code: "en", segments: 2 },
      { code: "ja", segments: 1 },
    ]);
  });

  it("counts completed translations per language", () => {
    const translations = {
      vi: ["xin chào", "", "tạm biệt"],
      en: ["hello", "world", ""],
    };
    const s = computeStats([seg("a"), seg("b")], [], translations);
    expect(s.translationsPerLang).toEqual({ vi: 2, en: 2 });
  });

  it("treats ts=0 as a valid session start (duration = max-min)", () => {
    const s = computeStats([seg("a", "en", 5_000), seg("b", "en", 0), seg("c", "en", 20_000)], [], {});
    expect(s.durationMs).toBe(20_000);
    const s2 = computeStats([seg("a", "en", 5_000), seg("c", "en", 20_000)], [], {});
    expect(s2.durationMs).toBe(15_000);
  });
});
