"use client";

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
    try {
      localStorage.setItem("lt:translateProvider", v);
    } catch {}
  };
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="text-[11px] font-medium tracking-wider uppercase text-zinc-400">Translate Provider</span>
      <select
        value={value}
        onChange={handleChange}
        className="h-9 bg-zinc-900 border border-zinc-700 rounded-lg px-3 text-sm w-full focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="text-[11px] leading-tight text-zinc-500 min-h-[28px]">{OPTIONS.find((o) => o.value === value)?.desc}</span>
    </label>
  );
}
