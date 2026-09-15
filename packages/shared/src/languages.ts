export type LangOption = { code: string; label: string; nativeLabel: string };

export const SUPPORTED_SOURCE_LANGUAGES: LangOption[] = [
  { code: 'auto', label: 'Auto-detect', nativeLabel: 'Tự động' },
  { code: 'en', label: 'English', nativeLabel: 'Tiếng Anh' },
  { code: 'vi', label: 'Vietnamese', nativeLabel: 'Tiếng Việt' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { code: 'ko', label: 'Korean', nativeLabel: '한국어' },
  { code: 'zh', label: 'Chinese', nativeLabel: '中文' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
];

export const SUPPORTED_TARGET_LANGUAGES: LangOption[] = [
  { code: 'vi', label: 'Vietnamese', nativeLabel: 'Tiếng Việt' },
  { code: 'en', label: 'English', nativeLabel: 'Tiếng Anh' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { code: 'ko', label: 'Korean', nativeLabel: '한국어' },
  { code: 'zh', label: 'Chinese', nativeLabel: '中文' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
];

// Ngôn ngữ dùng dấu câu để tách câu
const PUNCTUATION_LANGS = new Set(['en', 'vi', 'fr', 'de', 'es', 'auto']);

export function isPunctuationLang(lang: string): boolean {
  return PUNCTUATION_LANGS.has(lang);
}

export function getLangLabel(code: string): string {
  const all = [...SUPPORTED_SOURCE_LANGUAGES, ...SUPPORTED_TARGET_LANGUAGES];
  return all.find((l) => l.code === code)?.nativeLabel ?? code;
}
