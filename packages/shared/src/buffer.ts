import { isPunctuationLang } from "./languages";

export type SplitResult = {
  complete: string[];
  remainder: string;
};

// Tách câu cho ngôn ngữ dùng punctuation
export function splitByPunctuation(text: string): SplitResult {
  // Tách khi gặp . ! ? + khoảng trắng hoặc xuống dòng
  const regex = /[^.!?]+[.!?]+/g;
  const matches = text.match(regex);
  if (!matches) return { complete: [], remainder: text };
  const consumed = matches.join('');
  const remainder = text.slice(consumed.length);
  return { complete: matches.map((s) => s.trim()), remainder: remainder.trimStart() };
}

// Cho JA/ZH: tách theo độ dài + pause (caller truyền pause flag)
export function splitByLength(text: string, minWords = 8): SplitResult {
  const words = text.trim().split(/\s+/);
  if (words.length < minWords) return { complete: [], remainder: text };
  // Lấy 1 câu tạm theo minWords
  const sentence = words.slice(0, minWords).join(' ');
  const remainder = words.slice(minWords).join(' ');
  return { complete: [sentence], remainder };
}

export class SentenceBuffer {
  private buffer = '';
  private lastPushTs = 0;
  private readonly pauseMs = 700;
  private readonly minWordsNonPunct = 12;

  constructor(
    private sourceLang: string,
    private onSentence: (sentence: string) => void
  ) {}

  setLanguage(lang: string) {
    this.sourceLang = lang;
  }

  push(text: string, isEos = false) {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.buffer += (this.buffer ? ' ' : '') + trimmed;
    const now = Date.now();
    const elapsed = this.lastPushTs ? now - this.lastPushTs : 0;
    this.lastPushTs = now;

    if (isPunctuationLang(this.sourceLang)) {
      const result = splitByPunctuation(this.buffer);
      if (result.complete.length > 0) {
        result.complete.forEach((s) => this.onSentence(s));
        this.buffer = result.remainder;
      }
      if (isEos && this.buffer.trim()) {
        this.onSentence(this.buffer.trim());
        this.buffer = '';
      } else if (elapsed > this.pauseMs && this.buffer.trim()) {
        if (this.buffer.split(/\s+/).length >= 4) {
          this.onSentence(this.buffer.trim());
          this.buffer = '';
        }
      }
      return;
    }

    // JA/ZH/KO: non-punct path
    if (isEos || elapsed > this.pauseMs) {
      if (this.buffer.trim()) {
        this.onSentence(this.buffer.trim());
        this.buffer = '';
      }
      return;
    }
    const result = splitByLength(this.buffer, this.minWordsNonPunct);
    if (result.complete.length > 0) {
      result.complete.forEach((s) => this.onSentence(s));
      this.buffer = result.remainder;
    }
  }

  flush() {
    if (this.buffer.trim()) {
      this.onSentence(this.buffer.trim());
      this.buffer = '';
    }
  }
}
