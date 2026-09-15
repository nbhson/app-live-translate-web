// Browser-only STT via Web Speech API (webkitSpeechRecognition)
// Free forever, không cần server STT. Chỉ dùng khi provider = "webspeech"

export type WebSpeechCallbacks = {
  onInterim: (text: string, lang: string) => void;
  onFinal: (text: string, lang: string) => void;
  onError: (msg: string) => void;
};

let recognition: any | null = null;
let tabStream: MediaStream | null = null;
let tabAudioCtx: AudioContext | null = null;

export function isWebSpeechSupported(): boolean {
  return typeof window !== "undefined" && (!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition);
}

export function getWebSpeechSupportError(): string | null {
  if (typeof window === "undefined") return "SSR";
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return "Trình duyệt không hỗ trợ Web Speech API. Dùng Chrome/Edge desktop.";
  if (!window.isSecureContext) return "Web Speech API yêu cầu HTTPS hoặc localhost.";
  return null;
}

export function startWebSpeech(lang: string, cbs: WebSpeechCallbacks, opts?: { track?: MediaStreamTrack }): void {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) {
    cbs.onError("Web Speech API không hỗ trợ trên trình duyệt này.");
    return;
  }
  stopWebSpeech();
  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  // Web Speech expects BCP-47: en-US, vi-VN
  const map: Record<string, string> = { en: "en-US", vi: "vi-VN", ja: "ja-JP", ko: "ko-KR", zh: "zh-CN", fr: "fr-FR", de: "de-DE", es: "es-ES", auto: "en-US" };
  recognition.lang = map[lang] ?? lang ?? "en-US";
  recognition.onresult = (event: any) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      const text = res[0]?.transcript ?? "";
      if (!text) continue;
      if (res.isFinal) {
        cbs.onFinal(text.trim(), lang);
      } else {
        interim += text + " ";
      }
    }
    if (interim.trim()) cbs.onInterim(interim.trim(), lang);
  };
  recognition.onerror = (e: any) => {
    // no-speech / audio-capture là thường gặp khi im lặng
    if (e.error === "no-speech" || e.error === "aborted") return;
    cbs.onError(`WebSpeech lỗi: ${e.error ?? e.message}`);
  };
  recognition.onend = () => {
    // tự restart nếu vẫn ở trạng thái capturing (continuous đôi khi dừng sau 30s)
    if (recognition) {
      try {
        if (opts?.track) {
          // validate track trước khi restart
          if (opts.track.readyState !== 'live' || opts.track.kind !== 'audio') throw new Error('Track not live');
          (recognition as any).start(opts.track);
        } else recognition.start();
      } catch {}
    }
  };
  try {
    if (opts?.track) {
      if (opts.track.kind !== 'audio') throw new Error('Track is not audio');
      if (opts.track.readyState !== 'live') throw new Error('MediaStreamTrack is not live - tab chưa phát audio hoặc track đã ended');
      (recognition as any).start(opts.track);
    } else recognition.start();
  } catch (e: any) {
    const msg = e.message ?? String(e);
    if (msg.includes('MediaStreamTrack is not of kind') || msg.includes('not of state') || msg.includes('not live')) {
      cbs.onError(`Web Speech không hỗ trợ tab track trong web thường: ${msg}. Hãy dùng Extension Side Panel (mở extension -> Side Panel -> Tab) hoặc chuyển STT sang Deepgram (gửi PCM lên server) để bắt tab audio. Đang fallback sang mic...`);
      try { recognition.start(); } catch {}
      return;
    }
    cbs.onError(msg);
  }
}

// Bắt tab audio (kể cả iframe) cho Option 2 - thử extension tabCapture trước, fallback getDisplayMedia
export async function captureTabAudioForWebSpeech(): Promise<MediaStreamTrack | null> {
  // 1. Thử extension sidePanel tabCapture nếu có (chrome.runtime)
  try {
    const chromeAny = (window as any).chrome;
    if (chromeAny?.runtime?.sendMessage) {
      const streamId = await new Promise<string | null>((resolve) => {
        try {
          chromeAny.runtime.sendMessage({ type: 'get-tab-stream-id' }, (res: any) => {
            if (chromeAny.runtime.lastError) resolve(null);
            else resolve(res?.streamId ?? null);
          });
        } catch { resolve(null); }
      });
      if (streamId) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } as any,
          video: false
        } as any);
        const track = stream.getAudioTracks()[0];
        if (track) {
          // loopback để vẫn nghe
          try {
            tabAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const src = tabAudioCtx.createMediaStreamSource(stream);
            src.connect(tabAudioCtx.destination);
          } catch {}
          tabStream = stream;
          // stop track khi kết thúc sẽ cleanup
          track.addEventListener('ended', () => cleanupTabAudio());
          return track;
        }
      }
    }
  } catch {}
  // 2. Fallback pure web: getDisplayMedia (user pick This Tab + Share audio)
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true } as any);
    const track = stream.getAudioTracks()[0];
    if (!track) {
      stream.getTracks().forEach(t=>t.stop());
      return null;
    }
    tabStream = stream;
    track.addEventListener('ended', () => cleanupTabAudio());
    return track;
  } catch {
    return null;
  }
}

function cleanupTabAudio(){
  if (tabStream) { tabStream.getTracks().forEach(t=>t.stop()); tabStream=null; }
  if (tabAudioCtx) { try{tabAudioCtx.close();}catch{} tabAudioCtx=null; }
}

export function stopWebSpeech(): void {
  cleanupTabAudio();
  if (recognition) {
    const r = recognition;
    recognition = null;
    try {
      r.onend = null;
      r.stop();
    } catch {}
  }
}
