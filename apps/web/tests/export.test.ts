import { describe, it, expect, vi } from "vitest";
import { toTranscriptText, toMarkdown, downloadText } from "../lib/srt";

const segments = [
  { text: "Hello", language: "en", ts: 1000 },
  { text: "World", language: "en", ts: 4000 },
];
const translations = { vi: ["Xin chào", "Thế giới"] };

describe("toTranscriptText", () => {
  it("uses seq-mapped sentences when available", () => {
    const sentences = ["", "Hello mapped", "World mapped"];
    const out = toTranscriptText(segments, sentences, translations, ["vi"]);
    // translations are indexed by the ORIGINAL seq — rows use seq 1,2 so the
    // translation for seq 1 ("Thế giới") is expected, not seq 0 ("Xin chào").
    expect(out).toContain("Hello mapped");
    expect(out).toContain("  Thế giới");
    expect(out).not.toContain("Hello\n");
  });
  it("falls back to finals when no sentences", () => {
    const out = toTranscriptText(segments, [], translations, ["vi"]);
    // rows are joined with a blank line; translation lines are indented
    expect(out).toContain("Hello\n\n  Xin chào");
    expect(out).toContain("World\n\n  Thế giới");
  });
  it("returns empty string for empty input", () => {
    expect(toTranscriptText([], [], {}, [])).toBe("");
  });
});

describe("toMarkdown", () => {
  it("renders headers and per-language translations", () => {
    const out = toMarkdown(segments, [], translations, ["vi"]);
    expect(out.startsWith("# Live Translate — Transcript")).toBe(true);
    expect(out).toContain("**#1** Hello");
    expect(out).toContain("- **vi**: Xin chào");
  });
  it("renders empty doc when no segments", () => {
    expect(toMarkdown([], [], {}, [])).toBe("# Live Translate — Transcript\n");
  });
});

describe("downloadText", () => {
  it("creates a blob link, clicks it, and revokes the URL", () => {
    const click = vi.fn();
    const create = vi.fn(() => ({ href: "", download: "", click } as unknown as HTMLAnchorElement));
    const origCreate = document.createElement;
    document.createElement = create as unknown as typeof document.createElement;
    const origCreateURL = global.URL.createObjectURL;
    const origRevoke = global.URL.revokeObjectURL;
    const createURL = vi.fn(() => "blob:url");
    const revokeURL = vi.fn();
    global.URL.createObjectURL = createURL as unknown as typeof URL.createObjectURL;
    global.URL.revokeObjectURL = revokeURL as unknown as typeof URL.revokeObjectURL;
    try {
      downloadText("t.md", "# hi", "text/markdown;charset=utf-8");
      expect(create).toHaveBeenCalledWith("a");
      expect(createURL).toHaveBeenCalled();
      expect(click).toHaveBeenCalled();
      expect(revokeURL).toHaveBeenCalledWith("blob:url");
    } finally {
      document.createElement = origCreate;
      global.URL.createObjectURL = origCreateURL;
      global.URL.revokeObjectURL = origRevoke;
    }
  });
});
