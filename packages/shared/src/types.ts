// Shared types cho Web <-> Server <-> Extension
export type LanguageCode = string; // 'en' | 'vi' | 'ja' | 'ko' | 'zh' | 'auto'

export type STTResult = {
  type: 'interim' | 'final';
  transcript: string;
  language: LanguageCode;
  confidence: number;
  is_eos: boolean;
  words: { word: string; start: number; end: number }[];
};

export type TranslationResult = {
  source: string;
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  text: string;
  provider: string;
};

// WebSocket events
export type ClientToServerEvents = {
  join: (payload: { roomId: string; sourceLang: LanguageCode; targetLangs: LanguageCode[]; userId?: string }) => void;
  'audio:chunk': (buffer: ArrayBuffer) => void;
  'audio:stop': () => void;
  'settings:update': (payload: { sourceLang?: LanguageCode; targetLangs?: LanguageCode[] }) => void;
  'summary:request': (payload: { sessionId: string; window: string }) => void;
};

export type ServerToClientEvents = {
  'stt:interim': (payload: { transcript: string; language: LanguageCode; confidence: number }) => void;
  'stt:final': (payload: { transcript: string; language: LanguageCode; words: STTResult['words']; is_eos: boolean }) => void;
  'translate:final': (payload: TranslationResult) => void;
  'translate:stream': (payload: { targetLang: LanguageCode; token: string }) => void;
  'summary:chunk': (payload: { token: string }) => void;
  'summary:final': (payload: { summary: string; chapters: { title: string; start_ms: number }[]; actionItems: string[] }) => void;
  error: (payload: { code: string; message: string }) => void;
};

export type SessionConfig = {
  sourceLang: LanguageCode;
  targetLangs: LanguageCode[];
};
