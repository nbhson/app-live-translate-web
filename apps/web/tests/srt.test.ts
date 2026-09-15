import { describe, it, expect, vi } from "vitest";
import { toSrt, toVtt, downloadSrt } from "../lib/srt";

describe("toSrt", () => {
  it("formats srt with translations", () => {
    const segs = [
      { text: "Hello", language: "en", ts: 1000 },
      { text: "World", language: "en", ts: 4000 }
    ];
    const trans = { vi: ["Xin chào", "Thế giới"] };
    const out = toSrt(segs, trans, "vi");
    expect(out).toContain("1\n00:00:00,000 -->");
    expect(out).toContain("Hello\nXin chào");
    expect(out).toContain("2\n");
    expect(out).toContain("World\nThế giới");
  });
  it("handles missing translation", () => {
    const segs = [{ text: "Hi", language: "en", ts: 1000 }];
    const out = toSrt(segs, {}, "vi");
    expect(out).toContain("Hi\n\n");
  });
  it("handles empty segments", () => {
    const out = toSrt([], {}, "vi");
    expect(out).toBe("");
  });
  it("caps end at start+5000", () => {
    const segs = [{ text: "A", language: "en", ts: 1000 }, { text: "B", language: "en", ts: 20000 }];
    const out = toSrt(segs, {}, "vi");
    // first segment end = min(20000-1000-200, 5000) = 5000 -> 00:00:05,000
    expect(out).toContain("00:00:05,000");
  });
  it("toVtt prefixes WEBVTT and replaces comma", () => {
    const segs = [{ text: "Hi", language: "en", ts: 1000 }];
    const vtt = toVtt(segs as any, {}, "vi");
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:00.000");
  });
  it("downloadSrt creates link", () => {
    const create = vi.fn(() => ({ href:"", download:"", click: vi.fn() } as any));
    const origCreate = document.createElement;
    // @ts-ignore
    document.createElement = create;
    const origURL = global.URL.createObjectURL;
    const origRevoke = global.URL.revokeObjectURL;
    global.URL.createObjectURL = vi.fn(()=> "blob:url");
    global.URL.revokeObjectURL = vi.fn();
    downloadSrt("test.srt", "content");
    expect(create).toHaveBeenCalledWith("a");
    expect(global.URL.createObjectURL).toHaveBeenCalled();
    document.createElement = origCreate;
    global.URL.createObjectURL = origURL;
    global.URL.revokeObjectURL = origRevoke;
  });
});
