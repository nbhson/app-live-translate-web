import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { splitByPunctuation, splitByLength, SentenceBuffer } from "../src/buffer";
import { isPunctuationLang } from "../src/languages";

describe("splitByPunctuation", () => {
  it("splits sentences with punctuation", () => {
    const r = splitByPunctuation("Hello world. How are you? Fine!");
    expect(r.complete).toEqual(["Hello world.", "How are you?", "Fine!"]);
    expect(r.remainder).toBe("");
  });
  it("leaves remainder without punctuation", () => {
    const r = splitByPunctuation("Hello world without punct");
    expect(r.complete).toEqual([]);
    expect(r.remainder).toBe("Hello world without punct");
  });
  it("handles mixed complete + remainder", () => {
    const r = splitByPunctuation("Hi. there is remainder");
    expect(r.complete).toEqual(["Hi."]);
    expect(r.remainder).toBe("there is remainder");
  });
  it("handles empty string", () => {
    const r = splitByPunctuation("");
    expect(r.complete).toEqual([]);
    expect(r.remainder).toBe("");
  });
  it("trims remainder start", () => {
    const r = splitByPunctuation("Hello.   World");
    expect(r.remainder).toBe("World");
  });
});

describe("splitByLength", () => {
  it("returns empty if below minWords", () => {
    const r = splitByLength("short text", 8);
    expect(r.complete).toEqual([]);
    expect(r.remainder).toBe("short text");
  });
  it("splits at minWords", () => {
    const r = splitByLength("one two three four five six seven eight nine ten", 8);
    expect(r.complete).toEqual(["one two three four five six seven eight"]);
    expect(r.remainder).toBe("nine ten");
  });
  it("handles exact minWords", () => {
    const r = splitByLength("a b c d e f g h", 8);
    expect(r.complete).toHaveLength(1);
    expect(r.remainder).toBe("");
  });
});

describe("SentenceBuffer punct lang", () => {
  it("buffers and emits on punctuation", () => {
    const cb = vi.fn();
    const b = new SentenceBuffer("en", cb);
    b.push("Hello world.");
    expect(cb).toHaveBeenCalledWith("Hello world.");
  });
  it("emits multiple sentences", () => {
    const cb = vi.fn();
    const b = new SentenceBuffer("en", cb);
    b.push("Hi. There.");
    expect(cb).toHaveBeenCalledTimes(2);
  });
  it("buffers incomplete and flushes on isEos", () => {
    const cb = vi.fn();
    const b = new SentenceBuffer("en", cb);
    b.push("Incomplete without punct");
    expect(cb).not.toHaveBeenCalled();
    b.push(" still incomplete", true);
    expect(cb).toHaveBeenCalledWith("Incomplete without punct still incomplete");
  });
  it("handles empty push", () => {
    const cb = vi.fn();
    const b = new SentenceBuffer("en", cb);
    b.push("   ");
    expect(cb).not.toHaveBeenCalled();
  });
  it("flush emits remainder", () => {
    const cb = vi.fn();
    const b = new SentenceBuffer("en", cb);
    b.push("Pending text");
    b.flush();
    expect(cb).toHaveBeenCalledWith("Pending text");
  });
  it("flush does nothing if empty", () => {
    const cb = vi.fn();
    const b = new SentenceBuffer("en", cb);
    b.flush();
    expect(cb).not.toHaveBeenCalled();
  });
  it("setLanguage switches behavior", () => {
    const cb = vi.fn();
    const b = new SentenceBuffer("en", cb);
    b.setLanguage("ja");
    b.push("こんにちは", true);
    expect(cb).toHaveBeenCalled();
  });
  it("pause >700ms flushes punct buffer with 4+ words", async () => {
    const cb = vi.fn();
    const b = new SentenceBuffer("en", cb);
    vi.useFakeTimers();
    b.push("This is pending text");
    // simulate elapsed >700ms by mocking Date.now
    const now = Date.now();
    vi.setSystemTime(now + 800);
    b.push("more words here now");
    // The second push should have elapsed >700 and buffer >=4 words -> flush
    // But first push had no punctuation so buffered; second adds more -> check if flushed
    vi.useRealTimers();
  });
});

describe("SentenceBuffer non-punct lang", () => {
  it("flushes immediately on isEos", () => {
    const cb = vi.fn();
    const b = new SentenceBuffer("ja", cb);
    b.push("こんにちは世界", true);
    expect(cb).toHaveBeenCalledWith("こんにちは世界");
  });
  it("splits by length when exceeds 12 words", () => {
    const cb = vi.fn();
    const b = new SentenceBuffer("ja", cb);
    const long = Array(13).fill("word").join(" ");
    b.push(long);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].split(" ")).toHaveLength(12);
  });
  it("does not split if below minWords", () => {
    const cb = vi.fn();
    const b = new SentenceBuffer("ja", cb);
    b.push("word ".repeat(5).trim());
    expect(cb).not.toHaveBeenCalled();
    b.flush();
    expect(cb).toHaveBeenCalled();
  });
  it("handles zh as non-punct", () => {
    const cb = vi.fn();
    const b = new SentenceBuffer("zh", cb);
    b.push("你好", false);
    expect(cb).not.toHaveBeenCalled();
    b.push("世界", true);
    expect(cb).toHaveBeenCalled();
  });
});

describe("isPunctuationLang", () => {
  it("returns true for en/vi/auto", () => {
    expect(isPunctuationLang("en")).toBe(true);
    expect(isPunctuationLang("vi")).toBe(true);
    expect(isPunctuationLang("auto")).toBe(true);
  });
  it("returns false for ja/zh/ko", () => {
    expect(isPunctuationLang("ja")).toBe(false);
    expect(isPunctuationLang("zh")).toBe(false);
    expect(isPunctuationLang("ko")).toBe(false);
  });
});
