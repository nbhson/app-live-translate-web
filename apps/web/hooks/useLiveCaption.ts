"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createLiveSocket } from "../lib/socket";
import { saveTranscript } from "../lib/db";

type ServerEvent =
  | { type: "stt:interim"; transcript: string; language: string; confidence: number }
  | { type: "stt:final"; transcript: string; language: string; words: { word: string; start: number; end: number }[]; is_eos: boolean }
  | { type: "translate:final"; source: string; sourceLang: string; targetLang: string; text: string; provider: string }
  | { type: "translate:stream"; targetLang: string; token: string }
  | { type: "summary:chunk"; token: string }
  | { type: "summary:final"; summary: string; chapters: { title: string; start_ms: number }[]; actionItems: string[]; keywords?: string[] }
  | { type: "error"; code?: string; message: string };

import type { STTProvider } from "../components/STTProviderSelector";
import type { TranslateProvider } from "../components/TranslateProviderSelector";

export function useLiveCaption(opts: { sourceLang: string; targetLangs: string[]; sttProvider?: STTProvider; translateProvider?: TranslateProvider; audioSource?: "mic" | "tab" }) {
  const [interim, setInterim] = useState("");
  const [finals, setFinals] = useState<{ text: string; language: string; ts: number }[]>([]);
  const [translations, setTranslations] = useState<Record<string, string[]>>({});
  const [detectedLang, setDetectedLang] = useState<string>();
  const [confidence, setConfidence] = useState<number>();
  const [isConnected, setIsConnected] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string>();
  const [summary, setSummary] = useState<string | null>(null);
  const [chapters, setChapters] = useState<{ title: string; start_ms: number }[]>([]);
  const [actionItems, setActionItems] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const socketRef = useRef<ReturnType<typeof createLiveSocket> | null>(null);
  const finalsRef = useRef(finals);
  finalsRef.current = finals;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const sttProvider = opts.sttProvider ?? "deepgram";
  const translateProvider = opts.translateProvider ?? "ai";
  const audioSource = opts.audioSource ?? "mic";

  const url = (process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000") + "/ws";

  const handleServerEvent = useCallback((ev: ServerEvent & Record<string,any>) => {
    switch (ev.type) {
      case "stt:interim":
        setInterim(ev.transcript);
        setDetectedLang(ev.language);
        setConfidence(ev.confidence);
        break;
      case "stt:final": {
        setInterim("");
        const seg = { text: ev.transcript, language: ev.language, ts: Date.now() };
        setFinals((prev) => [...prev, seg]);
        // persist to IndexedDB per ARCHITECTURE.md persistence MVP
        saveTranscript({ sessionId: "default", seq: finalsRef.current.length, text: ev.transcript, language: ev.language, translations: {}, ts: seg.ts });
        break;
      }
      case "translate:final": {
        setTranslations((prev) => ({
          ...prev,
          [ev.targetLang]: [...(prev[ev.targetLang] ?? []), ev.text]
        }));
        break;
      }
      case "translate:stream": {
        // LLM streaming token: append
        setTranslations((prev) => {
          const arr = prev[ev.targetLang] ?? [];
          const last = arr[arr.length-1] ?? "";
          const next = [...arr.slice(0,-1), last + ev.token];
          // if empty, start new
          if (arr.length===0) return { ...prev, [ev.targetLang]: [ev.token] };
          return { ...prev, [ev.targetLang]: next };
        });
        break;
      }
      case "summary:chunk":
        setSummary((prev)=> (prev ?? "") + ev.token);
        break;
      case "summary:final":
        setSummary(ev.summary);
        setChapters(ev.chapters ?? []);
        setActionItems(ev.actionItems ?? []);
        setKeywords(ev.keywords ?? []);
        setSummaryLoading(false);
        break;
      case "error":
        setError(ev.message);
        if (ev.code) setSummaryLoading(false);
        break;
    }
  }, []);

  useEffect(() => {
    const sock = createLiveSocket({ url, sourceLang: optsRef.current.sourceLang, targetLangs: optsRef.current.targetLangs, sttProvider: (optsRef.current.sttProvider ?? "deepgram") as any, translateProvider: (optsRef.current.translateProvider ?? "ai") as any });
    socketRef.current = sock;
    const unsubOpen = sock.on("open", () => { setIsConnected(true); setError(undefined); });
    const unsubClose = sock.on("close", () => setIsConnected(false));
    const unsubErr = sock.on("error", () => setError("Không thể kết nối server"));
    const unsubAll = sock.on("*", (data:any)=> {
      if (data?.type) handleServerEvent(data as ServerEvent);
    });
    // specific listeners
    sock.on("stt:interim", (d)=> handleServerEvent(d as any));
    sock.on("stt:final", (d)=> handleServerEvent(d as any));
    sock.on("translate:final", (d)=> handleServerEvent(d as any));
    sock.on("translate:stream", (d)=> handleServerEvent(d as any));
    sock.on("summary:chunk", (d)=> handleServerEvent(d as any));
    sock.on("summary:final", (d)=> handleServerEvent(d as any));
    sock.on("error", (d)=> handleServerEvent(d as any));

    return () => {
      unsubOpen(); unsubClose(); unsubErr(); unsubAll();
      sock.close();
    };
  }, [url, handleServerEvent]);

  // Emit settings:update khi đổi ngôn ngữ/provider + persist localStorage per Phase 2
  useEffect(() => {
    socketRef.current?.updateSettings(opts.sourceLang, opts.targetLangs, { translateProvider, sttProvider });
    try { localStorage.setItem("lt:sourceLang", opts.sourceLang); localStorage.setItem("lt:targetLangs", JSON.stringify(opts.targetLangs)); localStorage.setItem("lt:translateProvider", translateProvider); } catch {}
  }, [opts.sourceLang, opts.targetLangs.join(","), translateProvider, sttProvider]);

  const startCapture = useCallback(async () => {
    if (sttProvider === "webspeech") {
      const { startWebSpeech, getWebSpeechSupportError, captureTabAudioForWebSpeech } = await import("../audio/webSpeech");
      const err = getWebSpeechSupportError();
      if (err) {
        setError(err);
        return;
      }
      setIsCapturing(true);
      setError(undefined);
      if (audioSource === "tab") {
        // Web thường không hỗ trợ recognition.start(track) -> dùng PCM gửi server (Deepgram/free) để bắt iframe/tab audio
        const isExtension = !!(window as any).chrome?.runtime?.id && window.location.protocol === "chrome-extension:";
        if (!isExtension) {
          // fallback: bắt tab qua getDisplayMedia PCM -> server STT (không dùng Web Speech track)
          setError(undefined);
          const { startCapture: startAudio } = await import("../audio/capture");
          startAudio((buf: ArrayBuffer) => {
            socketRef.current?.sendBinary(buf);
          }).catch((e: any) => {
            setIsCapturing(false);
            setError(e.message ?? String(e));
          });
          return;
        }
        let track: MediaStreamTrack | null = null;
        track = await captureTabAudioForWebSpeech();
        if (!track) {
          setError("Không lấy được tab audio. Hãy chọn This Tab + Share audio ở picker, hoặc chuyển về Mic.");
          setIsCapturing(false);
          return;
        }
        const cbs = {
          onInterim: (text: string, lang: string) => {
            setInterim(text);
            setDetectedLang(lang);
            setConfidence(0.95);
          },
          onFinal: (text: string, lang: string) => {
            setInterim("");
            const seg = { text, language: lang, ts: Date.now() };
            setFinals((prev) => [...prev, seg]);
            saveTranscript({ sessionId: "default", seq: finalsRef.current.length, text, language: lang, translations: {}, ts: seg.ts });
            socketRef.current?.emit("translate:request", { text, sourceLang: optsRef.current.sourceLang, targetLangs: optsRef.current.targetLangs });
          },
          onError: (msg: string) => setError(msg),
        };
        startWebSpeech(optsRef.current.sourceLang, cbs, { track });
        return;
      }
      // mic
      const cbs = {
        onInterim: (text: string, lang: string) => {
          setInterim(text);
          setDetectedLang(lang);
          setConfidence(0.95);
        },
        onFinal: (text: string, lang: string) => {
          setInterim("");
          const seg = { text, language: lang, ts: Date.now() };
          setFinals((prev) => [...prev, seg]);
          saveTranscript({ sessionId: "default", seq: finalsRef.current.length, text, language: lang, translations: {}, ts: seg.ts });
          socketRef.current?.emit("translate:request", { text, sourceLang: optsRef.current.sourceLang, targetLangs: optsRef.current.targetLangs });
        },
        onError: (msg: string) => setError(msg),
      };
      startWebSpeech(optsRef.current.sourceLang, cbs);
      return;
    }
    const { startCapture: startAudio } = await import("../audio/capture");
    setIsCapturing(true);
    setError(undefined);
    startAudio((buf: ArrayBuffer) => {
      socketRef.current?.sendBinary(buf);
    }).catch((e: any) => {
      setIsCapturing(false);
      setError(e.message ?? String(e));
    });
  }, [sttProvider, audioSource]);

  const stopCapture = useCallback(() => {
    if (sttProvider === "webspeech") {
      import("../audio/webSpeech").then(({ stopWebSpeech }) => stopWebSpeech());
      setIsCapturing(false);
      setError(undefined);
      return;
    }
    import("../audio/capture").then(({ stopCapture }) => stopCapture());
    socketRef.current?.emit("audio:stop", {});
    setIsCapturing(false);
  }, [sttProvider]);

  const clear = useCallback(() => {
    setInterim("");
    setFinals([]);
    setTranslations({});
    setSummary(null);
    setChapters([]); setActionItems([]); setKeywords([]);
  }, []);

  const requestSummary = useCallback((mode: "30s"|"full" = "full") => {
    setSummaryLoading(true);
    setSummary("");
    setChapters([]); setActionItems([]); setKeywords([]);
    const transcript = finalsRef.current.map((f) => f.text).join(" ");
    socketRef.current?.emit("summary:request", { sessionId: "default", window: mode, transcript });
  }, []);

  return {
    interim,
    finals,
    translations,
    detectedLang,
    confidence,
    isConnected,
    isCapturing,
    error,
    summary,
    chapters,
    actionItems,
    keywords,
    summaryLoading,
    startCapture,
    stopCapture,
    clear,
    requestSummary
  };
}
