"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createLiveSocket } from "../lib/socket";
import { saveTranscript } from "../lib/db";
import { saveSetting } from "../lib/settings";

type ServerEvent =
  | { type: "stt:interim"; transcript: string; language: string; confidence: number }
  | { type: "stt:final"; transcript: string; language: string; words: { word: string; start: number; end: number }[]; is_eos: boolean; seq?: number }
  | { type: "translate:final"; source: string; sourceLang: string; targetLang: string; text: string; provider: string; seq?: number }
  | { type: "translate:stream"; targetLang: string; token: string; seq?: number; source?: string }
  | { type: "summary:chunk"; token: string }
  | { type: "summary:final"; summary: string; chapters: { title: string; start_ms: number }[]; actionItems: string[]; keywords?: string[] }
  | { type: "suggest:result"; seq: number; question: string; structures: string[]; fullAnswers: string[]; sourceLang?: string }
  | { type: "error"; code?: string; message: string };

import type { STTProvider } from "../components/STTProviderSelector";
import type { TranslateProvider } from "../components/TranslateProviderSelector";

// Mirror server-side deque(maxlen=2000): session dài không được phình RAM/render.
const MAX_FINALS = 2000;

export type FinalSeg = { text: string; language: string; ts: number };

export function useLiveCaption(opts: {
  sourceLang: string;
  targetLangs: string[];
  sttProvider?: STTProvider;
  translateProvider?: TranslateProvider;
  audioSource?: "mic" | "tab";
  roomId?: string;
}) {
  const [interim, setInterim] = useState("");
  const [finals, setFinals] = useState<FinalSeg[]>([]);
  const [sentences, setSentences] = useState<string[]>([]); // seq -> source sentence (for correct mapping even when AI slow/out-of-order)
  const [sentenceTs, setSentenceTs] = useState<number[]>([]); // seq -> wall-clock ts of the final that produced it (SRT cue)
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
  const [suggestions, setSuggestions] = useState<{ seq: number; question: string; structures: string[]; fullAnswers: string[]; sourceLang?: string }[]>([]);

  const socketRef = useRef<ReturnType<typeof createLiveSocket> | null>(null);
  const finalsRef = useRef(finals);
  finalsRef.current = finals;
  const seqRef = useRef(0); // monoton tăng độc lập với render batch — saveTranscript seq không còn stale
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const sttProvider = opts.sttProvider ?? "deepgram";
  const translateProvider = opts.translateProvider ?? "ai";
  const audioSource = opts.audioSource ?? "mic";

  // WS URL mặc định derive theo page protocol: hardcode `ws://` gãy khi deploy
  // HTTPS (mixed content bị browser chặn luôn). Phải SSR-safe: prerender của
  // Next không có `window` — đọc bừa là crash cả build (R2-1).
  const wsUrl =
    process.env.NEXT_PUBLIC_WS_URL ??
    (typeof window !== "undefined"
      ? (window.location.protocol === "https:" ? "wss:" : "ws:") + `//${window.location.hostname}:8000`
      : "ws://localhost:8000");
  const url = wsUrl + "/ws";

  const handleServerEvent = useCallback((ev: ServerEvent & Record<string,any>) => {
    switch (ev.type) {
      case "stt:interim":
        setInterim(ev.transcript);
        setDetectedLang(ev.language);
        setConfidence(ev.confidence);
        break;
      case "stt:final": {
        setInterim("");
        // Server seq là nguồn chân thật; fallback tăng cục bộ. seqRef luôn được
        // đẩy tối thiểu lên seq+1 để saveTranscript không ghi đè seq cũ (WIP bug).
        const seq = typeof ev.seq === "number" ? ev.seq : seqRef.current++;
        if (seq + 1 > seqRef.current) seqRef.current = seq + 1;
        const seg = { text: ev.transcript, language: ev.language, ts: Date.now() };
        setFinals((prev) => [...prev.slice(-(MAX_FINALS - 1)), seg]); // R2-5: cap 2000 như server deque
        // ts thật cho export SRT/VTT: record ts theo seq (R2-4)
        setSentenceTs((prev) => {
          const next = [...prev];
          while (next.length <= seq) next.push(0);
          next[seq] = seg.ts;
          return next;
        });
        // persist to IndexedDB per ARCHITECTURE.md persistence MVP
        saveTranscript({ sessionId: "default", seq, text: ev.transcript, language: ev.language, translations: {}, ts: seg.ts });
        break;
      }
      case "translate:final": {
        const seq = typeof ev.seq === "number" ? ev.seq : undefined;
        if (seq !== undefined) {
          // seq-based exact mapping: even if AI responds out-of-order, place at correct index
          setSentences((prev) => {
            const next = [...prev];
            while (next.length <= seq) next.push("");
            next[seq] = ev.source;
            return next;
          });
          setTranslations((prev) => {
            const arr = [...(prev[ev.targetLang] ?? [])];
            while (arr.length <= seq) arr.push("");
            arr[seq] = ev.text;
            return { ...prev, [ev.targetLang]: arr };
          });
        } else {
          // fallback legacy (no seq) - append
          setSentences((prev) => [...prev, ev.source]);
          setTranslations((prev) => ({
            ...prev,
            [ev.targetLang]: [...(prev[ev.targetLang] ?? []), ev.text]
          }));
        }
        break;
      }
      case "translate:stream": {
        const seq = typeof ev.seq === "number" ? ev.seq : undefined;
        if (seq !== undefined) {
          // streaming token for specific seq - ensure sentence placeholder exists
          if (ev.source) {
            setSentences((prev) => {
              const next = [...prev];
              while (next.length <= seq) next.push("");
              if (!next[seq]) next[seq] = ev.source as string;
              return next;
            });
          }
          setTranslations((prev) => {
            const arr = [...(prev[ev.targetLang] ?? [])];
            while (arr.length <= seq) arr.push("");
            arr[seq] = (arr[seq] ?? "") + ev.token;
            return { ...prev, [ev.targetLang]: arr };
          });
        } else {
          // legacy append to last
          setTranslations((prev) => {
            const arr = prev[ev.targetLang] ?? [];
            const last = arr[arr.length-1] ?? "";
            const next = [...arr.slice(0,-1), last + ev.token];
            if (arr.length===0) return { ...prev, [ev.targetLang]: [ev.token] };
            return { ...prev, [ev.targetLang]: next };
          });
        }
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
      case "suggest:result": {
        setSuggestions((prev) => {
          // deduplicate by seq
          if (prev.some((p) => p.seq === ev.seq)) return prev;
          return [...prev, { seq: ev.seq, question: ev.question, structures: ev.structures ?? [], fullAnswers: ev.fullAnswers ?? [], sourceLang: ev.sourceLang }];
        });
        break;
      }
      case "error":
        setError(ev.message);
        setSummaryLoading(false);
        break;
    }
  }, []);

  useEffect(() => {
    const sock = createLiveSocket({ url, sourceLang: optsRef.current.sourceLang, targetLangs: optsRef.current.targetLangs, sttProvider: (optsRef.current.sttProvider ?? "deepgram") as any, translateProvider: (optsRef.current.translateProvider ?? "ai") as any, roomId: optsRef.current.roomId });
    socketRef.current = sock;
    const unsubOpen = sock.on("open", () => { setIsConnected(true); setError(undefined); });
    const unsubClose = sock.on("close", () => setIsConnected(false));
    const unsubErr = sock.on("error", () => setError("Cannot reach server — reconnecting…"));
    const unsubAll = sock.on("*", (data:any)=> {
      if (data?.type) handleServerEvent(data as ServerEvent);
    });
    // KHÔNG đăng ký per-type listeners: `sock.on("*", ...)` đã trigger cho mọi
    // event — đăng ký cả per-type (trước đây) làm handleServerEvent chạy 2 lần
    // mỗi event → finals/translations/suggestions BỊ NHÂN ĐÔI.

    return () => {
      unsubOpen(); unsubClose(); unsubErr(); unsubAll();
      sock.close();
    };
  }, [url, handleServerEvent]);

  // Persist ngôn ngữ/provider qua lib/settings.ts (R2-3) + emit settings:update
  useEffect(() => {
    socketRef.current?.updateSettings(opts.sourceLang, opts.targetLangs, { translateProvider, sttProvider });
    saveSetting("sourceLang", opts.sourceLang);
    saveSetting("targetLangs", opts.targetLangs);
    saveSetting("translateProvider", translateProvider);
  }, [opts.sourceLang, opts.targetLangs.join(","), translateProvider, sttProvider]);

  // ---- shared helpers -----------------------------------------------------
  // Webspeech mic & tab path dùng y hệt callback (R2-2: ~40 dòng trùng lặp)
  const pushFinal = useCallback((text: string, lang: string) => {
    setInterim("");
    const seg = { text, language: lang, ts: Date.now() };
    setFinals((prev) => [...prev.slice(-(MAX_FINALS - 1)), seg]);
    saveTranscript({ sessionId: "default", seq: seqRef.current++, text, language: lang, translations: {}, ts: seg.ts });
    socketRef.current?.emit("translate:request", { text, sourceLang: optsRef.current.sourceLang, targetLangs: optsRef.current.targetLangs });
  }, []);
  const makeWebSpeechHandlers = useCallback(() => ({
    onInterim: (text: string, lang: string) => {
      setInterim(text);
      setDetectedLang(lang);
      setConfidence(0.95);
    },
    onFinal: pushFinal,
    onError: (msg: string) => setError(msg),
  }), [pushFinal]);

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
          const { startCapture: startAudio } = await import("../audio/capture");
          startAudio((buf: ArrayBuffer) => {
            socketRef.current?.sendBinary(buf);
          }).catch((e: any) => {
            setIsCapturing(false);
            setError(e.message ?? String(e));
          });
          return;
        }
        const track = await captureTabAudioForWebSpeech();
        if (!track) {
          setError("Could not capture tab audio. Pick 'This Tab' + Share audio in the picker, or switch to Microphone.");
          setIsCapturing(false);
          return;
        }
        startWebSpeech(optsRef.current.sourceLang, makeWebSpeechHandlers(), { track });
        return;
      }
      // mic
      startWebSpeech(optsRef.current.sourceLang, makeWebSpeechHandlers());
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
  }, [sttProvider, audioSource, makeWebSpeechHandlers]);

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
    setSentences([]);
    setSentenceTs([]);
    setTranslations({});
    setSummary(null);
    setChapters([]); setActionItems([]); setKeywords([]);
    setSuggestions([]);
    seqRef.current = 0;
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
    sentences,
    sentenceTs,
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
    suggestions,
    clearSuggestions: useCallback(() => setSuggestions([]), []),
    startCapture,
    stopCapture,
    clear,
    requestSummary
  };
}
