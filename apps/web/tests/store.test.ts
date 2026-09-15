import { describe, it, expect, beforeEach } from "vitest";
import { useCaptionStore, loadPreferences, savePreferences } from "../lib/store";

describe("useCaptionStore", () => {
  beforeEach(() => {
    useCaptionStore.getState().clear();
    useCaptionStore.setState({ sourceLang:"en", targetLangs:["vi"], fontSize:18, opacity:0.95 });
  });
  it("initial state", () => {
    const s = useCaptionStore.getState();
    expect(s.interim).toBe("");
    expect(s.finals).toEqual([]);
    expect(s.sourceLang).toBe("en");
  });
  it("setInterim", () => {
    useCaptionStore.getState().setInterim("hello");
    expect(useCaptionStore.getState().interim).toBe("hello");
  });
  it("addFinal clears interim", () => {
    useCaptionStore.getState().setInterim("pending");
    useCaptionStore.getState().addFinal({ text:"Hi", language:"en", ts:123 });
    const s = useCaptionStore.getState();
    expect(s.finals).toHaveLength(1);
    expect(s.interim).toBe("");
  });
  it("addTranslation appends", () => {
    useCaptionStore.getState().addTranslation("vi", "Xin chào");
    useCaptionStore.getState().addTranslation("vi", "Thế giới");
    expect(useCaptionStore.getState().translations["vi"]).toEqual(["Xin chào","Thế giới"]);
  });
  it("setDetectedLang", () => {
    useCaptionStore.getState().setDetectedLang("ja");
    expect(useCaptionStore.getState().detectedLang).toBe("ja");
  });
  it("setLangs", () => {
    useCaptionStore.getState().setLangs("ja", ["en","vi"]);
    expect(useCaptionStore.getState().sourceLang).toBe("ja");
    expect(useCaptionStore.getState().targetLangs).toEqual(["en","vi"]);
  });
  it("setFontSize and setOpacity", () => {
    useCaptionStore.getState().setFontSize(22);
    useCaptionStore.getState().setOpacity(0.5);
    expect(useCaptionStore.getState().fontSize).toBe(22);
    expect(useCaptionStore.getState().opacity).toBe(0.5);
  });
  it("setPosition", () => {
    useCaptionStore.getState().setPosition({x:10,y:20});
    expect(useCaptionStore.getState().position).toEqual({x:10,y:20});
  });
  it("clear resets", () => {
    useCaptionStore.getState().addFinal({text:"a",language:"en",ts:1});
    useCaptionStore.getState().clear();
    expect(useCaptionStore.getState().finals).toEqual([]);
  });
  it("load/savePreferences", () => {
    savePreferences({ fontSize:20, opacity:0.8 });
    const p = loadPreferences();
    expect(p?.fontSize).toBe(20);
  });
  it("loadPreferences returns null if no data", () => {
    localStorage.removeItem("lt:prefs");
    expect(loadPreferences()).toBeNull();
  });
});
