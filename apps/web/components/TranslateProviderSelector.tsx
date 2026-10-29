"use client";
import { saveSetting } from "../lib/settings";

export type TranslateProvider = "ai" | "mymemory";

type Props = {
  value: TranslateProvider;
  onChange: (v: TranslateProvider) => void;
};

const OPTIONS: { value: TranslateProvider; label: string; desc: string }[] = [
  { value: "ai", label: "AI (Custom)", desc: "Uses CUSTOM_API_KEY/BASE_URL/MODEL - OpenAI-compatible" },
  { value: "mymemory", label: "MyMemory (FREE)", desc: "Free, no key required, ~5000 chars/day/IP" },
];

export function TranslateProviderSelector({ value, onChange }: Props) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value as TranslateProvider;
    onChange(v);
    saveSetting("translateProvider", v);
  };
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="label">Translate Provider</span>
      <select value={value} onChange={handleChange} className="select">
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="hint">{OPTIONS.find((o) => o.value === value)?.desc}</span>
    </label>
  );
}
