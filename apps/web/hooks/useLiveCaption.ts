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

export function useLiveCaption(opts: { sourceLang: string; targetLangs: string[] }) {
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
    const sock = createLiveSocket({ url, sourceLang: optsRef.current.sourceLang, targetLangs: optsRef.current.targetLangs });
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

  // Emit settings:update khi đổi ngôn ngữ + persist localStorage per Phase 2
  useEffect(() => {
    socketRef.current?.updateSettings(opts.sourceLang, opts.targetLangs);
    try { localStorage.setItem("lt:sourceLang", opts.sourceLang); localStorage.setItem("lt:targetLangs", JSON.stringify(opts.targetLangs)); } catch {}
  }, [opts.sourceLang, opts.targetLangs.join(",")]);

  const startCapture = useCallback(async () => {
    const { startCapture: startAudio } = await import("../audio/capture");
    setIsCapturing(true);
    setError(undefined);
    startAudio((buf: ArrayBuffer) => {
      socketRef.current?.sendBinary(buf);
    }).catch((e: any) => {
      setIsCapturing(false);
      setError(e.message ?? String(e));
    });
  }, []);

  const stopCapture = useCallback(() => {
    import("../audio/capture").then(({ stopCapture }) => stopCapture());
    socketRef.current?.emit("audio:stop", {});
    setIsCapturing(false);
  }, []);

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
